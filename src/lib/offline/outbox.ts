import { getLocalDB } from './db';
import type { FlushResult, OutboxAction } from './types';
import { canQueueOffline, computeBackoffMs } from './sync-rules';
export { canQueueOffline, computeBackoffMs } from './sync-rules';

/**
 * Outbox (file d'attente des mutations hors ligne).
 *
 * Chaque mutation est enregistrée localement avec un `clientMutationId`
 * (UUID) puis envoyée dans l'ordre FIFO. Idempotence côté serveur : même
 * clientMutationId = même résultat. Retry avec backoff exponentiel ;
 * les erreurs permanentes (4xx) passent en `error` avec affichage manuel.
 */

/** Nombre max de tentatives automatiques avant passage en erreur permanente. */
const MAX_AUTOMATIC_ATTEMPTS = 8;

/** Événements window émis pour que l'UI réagisse. */
export const OUTBOX_EVENTS = {
  queued: 'gradeup-outbox-queued',
  synced: 'gradeup-outbox-synced',
  failed: 'gradeup-outbox-failed',
  conflict: 'gradeup-outbox-conflict',
} as const;

function emit(name: string, detail?: unknown) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

export interface EnqueueOptions {
  entity: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  payload: Record<string, unknown>;
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE';
  schoolId: string;
  role: string;
  /** Marque l'action comme sensible (ne peut être créée qu'en ligne). */
  onlineOnly?: boolean;
}

/**
 * Enregistre une mutation dans l'outbox. Retourne le clientMutationId.
 * Lance une erreur si l'action est `onlineOnly` (opérations sensibles).
 */
export async function enqueueAction(options: EnqueueOptions): Promise<string> {
  if (!canQueueOffline(options.onlineOnly ?? false)) {
    throw new Error(
      'Connexion requise : cette opération ne peut pas être effectuée hors ligne.'
    );
  }
  const db = getLocalDB();
  const clientMutationId = crypto.randomUUID();
  const now = Date.now();
  const action: OutboxAction = {
    clientMutationId,
    entity: options.entity,
    operation: options.operation,
    recordId: options.recordId,
    payload: options.payload,
    endpoint: options.endpoint,
    method: options.method,
    schoolId: options.schoolId,
    role: options.role,
    createdAt: now,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: now,
    onlineOnly: options.onlineOnly ?? false,
  };
  await db.outbox.put(action);
  emit(OUTBOX_EVENTS.queued, { clientMutationId, entity: options.entity });
  return clientMutationId;
}

/** Liste les actions en attente (status pending/error/conflict), triées FIFO. */
export async function listActions(statuses?: OutboxAction['status'][]): Promise<OutboxAction[]> {
  const db = getLocalDB();
  const all = await db.outbox.orderBy('createdAt').toArray();
  if (!statuses || statuses.length === 0) return all;
  return all.filter((a) => statuses.includes(a.status));
}

/** Compte les actions par statut. */
export async function countActions(): Promise<{ pending: number; error: number; conflict: number; total: number }> {
  const db = getLocalDB();
  const all = await db.outbox.toArray();
  const pending = all.filter((a) => a.status === 'pending' || a.status === 'inflight').length;
  const error = all.filter((a) => a.status === 'error').length;
  const conflict = all.filter((a) => a.status === 'conflict').length;
  return { pending, error, conflict, total: all.length };
}

/** Annule une action (supprime de la file + marque le record local en error). */
export async function cancelAction(clientMutationId: string): Promise<void> {
  const db = getLocalDB();
  const action = await db.outbox.get(clientMutationId);
  if (!action) return;
  await db.outbox.delete(clientMutationId);
  const table = (db as unknown as Record<string, { get: (id: string) => Promise<LocalRecordLike | undefined>; update: (id: string, patch: Record<string, unknown>) => Promise<number> }>)[action.entity];
  if (table) {
    const rec = await table.get(action.recordId);
    if (rec && rec.syncStatus !== 'synced') {
      await table.update(action.recordId, { syncStatus: 'error', syncError: 'Action annulée' });
    }
  }
}

interface LocalRecordLike {
  id: string;
  syncStatus: string;
}

/** Remet une action en erreur dans la file (statut pending, reset tentatives). */
export async function retryAction(clientMutationId: string): Promise<void> {
  const db = getLocalDB();
  await db.outbox.update(clientMutationId, {
    status: 'pending',
    attempts: 0,
    nextAttemptAt: Date.now(),
    lastError: null,
  });
  emit(OUTBOX_EVENTS.queued, { clientMutationId });
}

/**
 * Vide intégralement l'outbox (action manuelle « oublier les actions »).
 * Les records locaux restants sont marqués `error` pour visibilité.
 */
export async function discardAllActions(): Promise<number> {
  const db = getLocalDB();
  const all = await db.outbox.toArray();
  for (const action of all) {
    await cancelAction(action.clientMutationId);
  }
  return all.length;
}

/**
 * Envoie une action au serveur via /api/sync/push (batch unitaire ici).
 * Retourne le statut HTTP ou null si erreur réseau.
 */
async function sendAction(action: OutboxAction): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch('/api/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      mutations: [
        {
          clientMutationId: action.clientMutationId,
          entity: action.entity,
          operation: action.operation,
          recordId: action.recordId,
          payload: action.payload,
          schoolId: action.schoolId,
          clientUpdatedAt: action.createdAt,
          // Le serveur valide l'endpoint contre une allowlist.
          endpoint: action.endpoint,
          method: action.method,
        },
      ],
    }),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const result = (body as {
    results?: Array<{ clientMutationId?: string; ok?: boolean; status?: number; error?: string }>;
  } | null)?.results?.find((item) => item.clientMutationId === action.clientMutationId);

  // The push endpoint uses HTTP 207 for partial batches. `Response.ok` is
  // still true for 207, so trust the per-mutation result, not the envelope.
  if (result) {
    return {
      ok: result.ok === true,
      status: typeof result.status === 'number' ? result.status : res.status,
      body: { error: result.error || (result.ok ? undefined : 'Résultat de synchronisation en échec') },
    };
  }

  if (res.ok) {
    return { ok: false, status: 502, body: { error: 'Réponse de synchronisation invalide' } };
  }
  return { ok: false, status: res.status, body };
}

let flushing = false;

/**
 * Envoie la file FIFO : actions `pending` arrivées à échéance, dans l'ordre
 * de création. Arrête au premier échec évolutif (5xx / réseau) pour préserver
 * l'ordre ; les 4xx sont des erreurs permanentes et ne bloquent pas la suite.
 */
export async function flushOutbox(): Promise<FlushResult> {
  if (typeof navigator === 'undefined' || !navigator.onLine) {
    const counts = await countActions();
    return { synced: 0, failed: counts.error, pending: counts.pending, conflicts: counts.conflict };
  }
  if (flushing) {
    const counts = await countActions();
    return { synced: 0, failed: counts.error, pending: counts.pending, conflicts: counts.conflict };
  }
  flushing = true;
  const db = getLocalDB();
  let synced = 0;
  try {
    const now = Date.now();
    const due = (await db.outbox
      .where('status')
      .anyOf('pending', 'inflight')
      .and((a) => a.nextAttemptAt <= now)
      .sortBy('createdAt'));

    for (const action of due) {
      await db.outbox.update(action.clientMutationId, { status: 'inflight' });
      try {
        const result = await sendAction(action);
        if (result.ok) {
          await db.outbox.update(action.clientMutationId, { status: 'done' });
          await db.outbox.delete(action.clientMutationId);
          // Marquer le record local comme synchronisé.
          const table = (db as unknown as Record<string, { update: (id: string, patch: Record<string, unknown>) => Promise<number> }>)[action.entity];
          if (table) {
            const patch: Record<string, unknown> = { syncStatus: 'synced', syncError: null };
            // Un create peut renvoyer l'id serveur.
            const serverId = (result.body as { id?: string } | null)?.id;
            if (action.operation === 'create' && serverId && serverId !== action.recordId) {
              // Conserver l'id client pour la clé locale ; l'id serveur est dans lastResponse.
            }
            await table.update(action.recordId, patch);
          }
          synced++;
          emit(OUTBOX_EVENTS.synced, { clientMutationId: action.clientMutationId });
        } else if (result.status >= 400 && result.status < 500) {
          // Erreur permanente : la requête est refusée, ne pas rejouer.
          const isConflict = result.status === 409;
          await db.outbox.update(action.clientMutationId, {
            status: isConflict ? 'conflict' : 'error',
            attempts: action.attempts + 1,
            lastError: (result.body as { error?: string } | null)?.error || `HTTP ${result.status}`,
            lastStatus: result.status,
            lastResponse: result.body,
          });
          const table = (db as unknown as Record<string, { update: (id: string, patch: Record<string, unknown>) => Promise<number> }>)[action.entity];
          if (table) {
            await table.update(action.recordId, {
              syncStatus: isConflict ? 'conflict' : 'error',
              syncError: (result.body as { error?: string } | null)?.error || `HTTP ${result.status}`,
            });
          }
          if (isConflict) emit(OUTBOX_EVENTS.conflict, { clientMutationId: action.clientMutationId });
          else emit(OUTBOX_EVENTS.failed, { clientMutationId: action.clientMutationId });
        } else {
          // Erreur évolution (5xx) : backoff, on arrête pour préserver l'ordre.
          const attempts = action.attempts + 1;
          const backoff = computeBackoffMs(attempts);
          await db.outbox.update(action.clientMutationId, {
            status: attempts >= MAX_AUTOMATIC_ATTEMPTS ? 'error' : 'pending',
            attempts,
            nextAttemptAt: Date.now() + backoff,
            lastError: (result.body as { error?: string } | null)?.error || `HTTP ${result.status}`,
            lastStatus: result.status,
          });
          if (attempts >= MAX_AUTOMATIC_ATTEMPTS) {
            const table = (db as unknown as Record<string, { update: (id: string, patch: Record<string, unknown>) => Promise<number> }>)[action.entity];
            if (table) {
              await table.update(action.recordId, { syncStatus: 'error', syncError: 'Échec après plusieurs tentatives' });
            }
            emit(OUTBOX_EVENTS.failed, { clientMutationId: action.clientMutationId });
          }
          break;
        }
      } catch (networkError) {
        // Erreur réseau : backoff, on arrête (la file sera re-testée au prochain trigger).
        const attempts = action.attempts + 1;
        const backoff = computeBackoffMs(attempts);
        await db.outbox.update(action.clientMutationId, {
          status: 'pending',
          attempts,
          nextAttemptAt: Date.now() + backoff,
          lastError: networkError instanceof Error ? networkError.message : 'Erreur réseau',
          lastStatus: null,
        });
        break;
      }
    }
  } finally {
    flushing = false;
  }
  const counts = await countActions();
  return { synced, failed: counts.error, pending: counts.pending, conflicts: counts.conflict };
}
