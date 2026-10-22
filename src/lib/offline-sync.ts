/**
 * Couche de compatibilité historique.
 *
 * Les 4 composants existants (teacher-grades, teacher-attendance,
 * teacher-homework, message-center) appellent encore `queueOrFetch` /
 * `fetchJsonWithCache`. On délègue désormais au socle Dexie
 * (`@/lib/offline`) pour éviter deux files concurrentes, tout en gardant
 * la même signature publique.
 */
import { enqueueAction, flushOutbox } from '@/lib/offline/outbox';
import { getLocalDB } from '@/lib/offline/db';

export type OfflineRequest = {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  createdAt: number;
};

/** Convertit une URL d'API + payload vers une entité canonique de l'outbox. */
function inferEntity(url: string): { entity: string; recordId: string } {
  if (url.includes('/attendance')) return { entity: 'attendance', recordId: crypto.randomUUID() };
  if (url.includes('/grades')) return { entity: 'grades', recordId: crypto.randomUUID() };
  if (url.includes('/homework')) return { entity: 'homework', recordId: crypto.randomUUID() };
  if (url.includes('/notifications')) return { entity: 'notifications', recordId: crypto.randomUUID() };
  if (url.includes('/messages')) return { entity: 'messages', recordId: crypto.randomUUID() };
  if (url.includes('/submissions')) return { entity: 'submissions', recordId: crypto.randomUUID() };
  return { entity: 'generic', recordId: crypto.randomUUID() };
}

/** Résout le rôle + schoolId depuis le store zustand persisté (best effort). */
function resolveAuth(): { schoolId: string; role: string } {
  try {
    const raw = localStorage.getItem('gradeup-storage');
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { user?: { schoolId?: string; role?: string } } };
      const u = parsed.state?.user;
      if (u?.schoolId) return { schoolId: u.schoolId, role: u.role ?? 'STUDENT' };
    }
  } catch {
    /* ignore */
  }
  return { schoolId: '', role: 'STUDENT' };
}

/**
 * Enfile une mutation hors ligne (via le nouvel outbox) ou tente l'envoi.
 * Retourne la Response si l'envoi a réussi, null si la requête a été
 * enfilée (hors ligne).
 */
export async function queueOrFetch(input: RequestInfo | URL, init: RequestInit): Promise<Response | null> {
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const method = (init.method || 'GET').toUpperCase();
  if (method !== 'GET' && !headers['x-idempotency-key']) {
    headers['x-idempotency-key'] = crypto.randomUUID();
  }

  try {
    const response = await fetch(input, { ...init, headers });
    return response;
  } catch {
    // Erreur réseau → enfile dans le nouvel outbox (si non-GET).
    if (method === 'GET') return null;
    const url = typeof input === 'string' ? input : input.toString();
    const { entity, recordId } = inferEntity(url);
    const { schoolId, role } = resolveAuth();
    let payload: Record<string, unknown> = {};
    if (typeof init.body === 'string') {
      try {
        payload = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        payload = { raw: init.body };
      }
    }
    await enqueueAction({
      entity,
      operation: method === 'POST' ? 'create' : method === 'PUT' ? 'update' : 'delete',
      recordId,
      payload,
      endpoint: url,
      method: method as 'POST' | 'PUT' | 'DELETE',
      schoolId,
      role,
    });
    return null;
  }
}

/** Flush de la file (délégué au nouvel outbox). */
export async function flushOfflineQueue(): Promise<{ synced: number; pending: number }> {
  const result = await flushOutbox();
  return { synced: result.synced, pending: result.pending };
}

/** Enfile une requête offline brute (API historique, gardée pour compat). */
export async function enqueueOfflineRequest(request: Omit<OfflineRequest, 'id' | 'createdAt'>): Promise<void> {
  const { entity, recordId } = inferEntity(request.url);
  const { schoolId, role } = resolveAuth();
  let payload: Record<string, unknown> = {};
  if (request.body) {
    try {
      payload = JSON.parse(request.body) as Record<string, unknown>;
    } catch {
      payload = { raw: request.body };
    }
  }
  await enqueueAction({
    entity,
    operation: request.method === 'POST' ? 'create' : request.method === 'PUT' ? 'update' : 'delete',
    recordId,
    payload,
    endpoint: request.url,
    method: (request.method || 'POST') as 'POST' | 'PUT' | 'DELETE',
    schoolId,
    role,
  });
}

// --- Cache JSON par URL (lecture seule) : conservé tel quel via syncMeta ---
export async function cacheJson(key: string, value: unknown): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = getLocalDB();
  await db.syncMeta.put({ key: `cache:${key}`, value: { value, cachedAt: Date.now() } });
}

export async function readCachedJson<T>(key: string): Promise<T | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = getLocalDB();
  const meta = await db.syncMeta.get(`cache:${key}`);
  return (meta?.value as { value: T } | undefined)?.value ?? null;
}

export async function fetchJsonWithCache<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as T;
    await cacheJson(url, data);
    return data;
  } catch {
    return (await readCachedJson<T>(url)) ?? fallback;
  }
}
