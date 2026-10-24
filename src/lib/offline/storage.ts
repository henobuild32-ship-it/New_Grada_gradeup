import { deleteLocalDB, getLocalDB, ENTITY_NAMES } from './db';

/**
 * Gestion du stockage local : quota, purge des données anciennes,
 * limitation de taille, « Vider le cache local ».
 */

/** Durée de rétention par défaut des données synchronisées (7 jours). */
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Estimation de la taille (en octets) via l'API StorageManager si dispo. */
export async function estimateStorage(): Promise<{ usage: number; quota: number; ratio: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    const usage = est.usage ?? 0;
    const quota = est.quota ?? 0;
    return { usage, quota, ratio: quota > 0 ? usage / quota : 0 };
  } catch {
    return null;
  }
}

/**
 * Purge les enregistrements `synced` plus vieux que `retentionMs`.
 * Les records `pending`/`error`/`conflict` sont conservés (non synchronisés).
 */
export async function purgeOldRecords(retentionMs: number = DEFAULT_RETENTION_MS): Promise<number> {
  const db = getLocalDB();
  const cutoff = Date.now() - retentionMs;
  let purged = 0;
  for (const entity of ENTITY_NAMES) {
    const table = (db as unknown as Record<string, {
      toArray: () => Promise<Array<{ id: string; updatedAt: number; syncStatus: string }>>;
      delete: (id: string) => Promise<void>;
    }>)[entity];
    if (!table) continue;
    const rows = await table.toArray();
    for (const row of rows) {
      if (row.syncStatus === 'synced' && row.updatedAt < cutoff) {
        await table.delete(row.id);
        purged++;
      }
    }
  }
  // Purger aussi les fichiers hors ligne anciens (> 30 jours).
  const files = await db.offlineFiles.toArray();
  const syncMeta = await db.syncMeta.toArray();
  const pendingFileKeys = new Set(syncMeta.flatMap((entry) => {
    const value = entry.value && typeof entry.value === 'object' ? entry.value as { fileKey?: unknown } : null;
    return typeof value?.fileKey === 'string' ? [value.fileKey] : [];
  }));
  const fileCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const f of files) {
    if (f.downloadedAt < fileCutoff && !pendingFileKeys.has(f.url)) {
      await db.offlineFiles.delete(f.url);
      purged++;
    }
  }
  return purged;
}

/**
 * Vide intégralement le cache local (données + fichiers hors ligne).
 * L'outbox est conservée (les actions en attente ne doivent pas être perdues).
 */
export async function clearLocalCache(): Promise<{ clearedTables: number; clearedFiles: number }> {
  const db = getLocalDB();
  let clearedTables = 0;
  let clearedFiles = 0;
  for (const entity of ENTITY_NAMES) {
    const table = (db as unknown as Record<string, { clear: () => Promise<void> }>)[entity];
    if (table) {
      await table.clear();
      clearedTables++;
    }
  }
  const files = await db.offlineFiles.toArray();
  clearedFiles = files.length;
  await db.offlineFiles.clear();
  return { clearedTables, clearedFiles };
}

/**
 * Nettoyage complet à la déconnexion : purge TOUT y compris l'outbox
 * (sécurité : ne pas laisser de données d'un autre utilisateur).
 */
export async function wipeAllLocalData(): Promise<void> {
  await deleteLocalDB();
}

/** Télécharge un fichier pour lecture hors ligne (cache à la demande). */
export async function downloadFileForOffline(url: string, schoolId: string, fileName?: string): Promise<void> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Téléchargement impossible (HTTP ${res.status})`);
  const blob = await res.blob();
  const db = getLocalDB();
  await db.offlineFiles.put({
    url,
    fileName: fileName ?? url.split('/').pop() ?? 'fichier',
    blob,
    size: blob.size,
    downloadedAt: Date.now(),
    schoolId,
  });
}

/** Récupère un fichier hors ligne (Blob) ou null. */
export async function getOfflineFile(url: string): Promise<Blob | null> {
  const db = getLocalDB();
  const rec = await db.offlineFiles.get(url);
  return rec?.blob ?? null;
}

/** Liste des fichiers hors ligne téléchargés. */
export async function listOfflineFiles(schoolId?: string) {
  const db = getLocalDB();
  const all = await db.offlineFiles.toArray();
  return schoolId ? all.filter((f) => f.schoolId === schoolId) : all;
}

/** Supprime un fichier hors ligne. */
export async function removeOfflineFile(url: string): Promise<void> {
  const db = getLocalDB();
  await db.offlineFiles.delete(url);
}
