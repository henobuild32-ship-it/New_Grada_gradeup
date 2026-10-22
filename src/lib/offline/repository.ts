import { getLocalDB, getTable, ENTITY_NAMES } from './db';
import type { EntityName } from './db';
import type { LocalRecord } from './types';
import { enqueueAction } from './outbox';

/**
 * Couche d'accès aux données unique (repository).
 *
 * Lecture locale d'abord : les composants lisent via Dexie (live queries),
 * le réseau rafraîchit en arrière-plan et met à jour la base locale.
 * Aucun composant n'appelle fetch directement pour les données lisibles —
 * il passe par `readRemote` (qui alimente la table) ou par les hooks.
 */

/** Normalize un enregistrement serveur vers le format LocalRecord. */
function normalize<T extends LocalRecord>(raw: Record<string, unknown>, schoolId: string): T {
  const now = Date.now();
  return {
    ...raw,
    id: String(raw.id ?? ''),
    schoolId: String(raw.schoolId ?? schoolId),
    updatedAt: now,
    version: Number(raw.version ?? 1),
    syncStatus: 'synced',
    deletedAt: (raw.deletedAt as number | null) ?? null,
  } as T;
}

/**
 * Met à jour (upsert) une table locale à partir d'une liste d'enregistrements
 * serveur. Les records locaux en attente (pending) ne sont pas écrasés.
 */
export async function applyRemoteList<T extends LocalRecord>(
  entity: EntityName,
  records: Record<string, unknown>[],
  schoolId: string
): Promise<number> {
  const db = getLocalDB();
  const table = getTable(entity) as unknown as {
    bulkPut: (items: T[]) => Promise<void>;
    put: (item: T & { id: string }) => Promise<void>;
    get: (id: string) => Promise<T | undefined>;
  };
  let applied = 0;
  for (const raw of records) {
    const rec = normalize<T>(raw, schoolId);
    if (!rec.id) continue;
    const existing = await table.get(rec.id);
    // Ne pas écraser une mutation locale non synchronisée.
    if (existing && (existing.syncStatus === 'pending' || existing.syncStatus === 'error' || existing.syncStatus === 'conflict')) {
      continue;
    }
    await table.put(rec as unknown as T & { id: string });
    applied++;
  }
  return applied;
}

/** Lit une page locale (non deleted) pour une entité et une école. */
export async function readLocal<T extends LocalRecord>(
  entity: EntityName,
  schoolId: string,
  filter?: (rec: T) => boolean
): Promise<T[]> {
  const db = getLocalDB();
  const table = getTable(entity) as unknown as {
    where: (idx: string) => { equals: (v: string) => { toArray: () => Promise<T[]> } };
    toArray: () => Promise<T[]>;
  };
  let rows: T[];
  try {
    rows = await table.where('schoolId').equals(schoolId).toArray();
  } catch {
    rows = await table.toArray();
  }
  rows = rows.filter((r) => !r.deletedAt);
  if (filter) rows = rows.filter(filter);
  return rows;
}

/** Écrit / upsert un enregistrement local (soft delete si deletedAt). */
export async function writeLocal<T extends LocalRecord>(
  entity: EntityName,
  record: Partial<T> & { id?: string; schoolId: string }
): Promise<T> {
  const db = getLocalDB();
  const table = getTable(entity) as unknown as {
    get: (id: string) => Promise<T | undefined>;
    put: (item: T) => Promise<void>;
  };
  const id = record.id ?? crypto.randomUUID();
  const existing = await table.get(id);
  const merged: T = {
    ...(existing ?? {}),
    ...record,
    id,
    schoolId: record.schoolId,
    updatedAt: Date.now(),
    version: (existing?.version ?? 0) + 1,
    syncStatus: record.deletedAt ? 'pending' : record.syncStatus ?? 'pending',
  } as T;
  await table.put(merged);
  return merged;
}

/** Soft delete local d'un enregistrement. */
export async function softDeleteLocal(entity: EntityName, id: string): Promise<void> {
  const db = getLocalDB();
  const table = getTable(entity) as unknown as {
    get: (id: string) => Promise<LocalRecord | undefined>;
    update: (id: string, patch: Record<string, unknown>) => Promise<number>;
  };
  await table.update(id, { deletedAt: Date.now(), syncStatus: 'pending', updatedAt: Date.now() });
}

export interface MutationOptions {
  schoolId: string;
  role: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE';
  /** Si true, refuse la mutation hors ligne (opérations sensibles). */
  onlineOnly?: boolean;
}

/**
 * Mutation local-first : écrit en local (optimiste), enqueue dans l'outbox,
 * et tente un flush immédiat si en ligne. Retourne l'enregistrement local.
 */
export async function mutateLocalFirst<T extends LocalRecord>(
  entity: EntityName,
  operation: 'create' | 'update' | 'delete',
  record: Partial<T> & { id?: string; schoolId: string },
  options: MutationOptions
): Promise<{ local: T; clientMutationId: string }> {
  let local: T;
  if (operation === 'delete') {
    const id = record.id ?? '';
    await softDeleteLocal(entity, id);
    const table = getTable(entity) as unknown as { get: (id: string) => Promise<T | undefined> };
    local = (await table.get(id)) as T;
  } else {
    local = await writeLocal<T>(entity, record);
  }
  const clientMutationId = await enqueueAction({
    entity,
    operation,
    recordId: local.id,
    payload: { ...local } as Record<string, unknown>,
    endpoint: options.endpoint,
    method: options.method,
    schoolId: options.schoolId,
    role: options.role,
    onlineOnly: options.onlineOnly,
  });
  return { local, clientMutationId };
}

/**
 * Rafraîchit une entité depuis le réseau (GET) et applique à la base locale.
 * À appeler en arrière-plan après l'affichage local (stale-while-revalidate).
 */
export async function refreshRemote<T extends LocalRecord>(
  entity: EntityName,
  url: string,
  schoolId: string,
  extract?: (data: unknown) => Record<string, unknown>[]
): Promise<T[] | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    const list = extract
      ? extract(data)
      : Array.isArray(data)
        ? data
        : Array.isArray((data as { data?: unknown[] })?.data)
          ? ((data as { data: unknown[] }).data as Record<string, unknown>[])
          : [];
    await applyRemoteList<T>(entity, list, schoolId);
    return readLocal<T>(entity, schoolId);
  } catch {
    // Hors ligne : conserver la copie locale.
    return null;
  }
}

/** Lecture d'une entité : locale d'abord, rafraîchi en arrière-plan. */
export async function readThrough<T extends LocalRecord>(
  entity: EntityName,
  schoolId: string,
  remoteUrl?: string,
  filter?: (rec: T) => boolean
): Promise<T[]> {
  const local = await readLocal<T>(entity, schoolId, filter);
  if (remoteUrl && typeof navigator !== 'undefined' && navigator.onLine) {
    // Fire-and-forget : l'UI est déjà rendue avec la copie locale.
    void refreshRemote<T>(entity, remoteUrl, schoolId);
  }
  return local;
}

/** Liste des entités gérées (pour le purge / clear). */
export function managedEntities(): readonly EntityName[] {
  return ENTITY_NAMES;
}
