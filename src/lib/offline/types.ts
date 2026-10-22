/**
 * Types partagés de la couche offline (Dexie + outbox + sync).
 * Toute entité locale suit le même format : id, schoolId, updatedAt, version,
 * syncStatus et deletedAt (soft delete). Ces champs permettent le delta
 * served-side (/api/sync/pull?since=) et la résolution de conflits.
 */

export type SyncStatus = 'synced' | 'pending' | 'error' | 'conflict';

/** Enveloppe commune de tous les enregistrements locaux. */
export interface LocalRecord {
  /** UUID client (ou id serveur si déjà synchronisé). */
  id: string;
  schoolId: string;
  /** Dernière modification connue (epoch ms). */
  updatedAt: number;
  /** Version incrémentale pour la détection de conflit (1 par défaut). */
  version: number;
  syncStatus: SyncStatus;
  /** Soft delete : tombstone conservé jusqu'à propagation. */
  deletedAt?: number | null;
  /** Erreur de synchronisation (quand syncStatus = 'error' | 'conflict'). */
  syncError?: string | null;
}

/** Statut d'une action de la file d'attente. */
export type OutboxStatus = 'pending' | 'inflight' | 'error' | 'conflict' | 'done';

/**
 * Action hors ligne : chaque mutation est enregistrée localement avec un
 * clientMutationId (UUID) puis envoyée dans l'ordre FIFO. Idempotence
 * côté serveur : même clientMutationId = même résultat.
 */
export interface OutboxAction {
  /** UUID client unique = clé d'idempotence. */
  clientMutationId: string;
  /** Type d'entité cible (ex. 'attendance', 'grade'). */
  entity: string;
  /** Opération CRUD. */
  operation: 'create' | 'update' | 'delete';
  /** Id de l'enregistrement local concerné. */
  recordId: string;
  /** Payload à envoyer (déjà normalisé côté client). */
  payload: Record<string, unknown>;
  /** URL API cible (ex. '/api/attendance/batch'). */
  endpoint: string;
  /** Méthode HTTP (POST/PUT/DELETE). */
  method: 'POST' | 'PUT' | 'DELETE';
  schoolId: string;
  /** Rôle de l'utilisateur qui crée l'action (verrouillage serveur). */
  role: string;
  /** Epoch ms de création. */
  createdAt: number;
  status: OutboxStatus;
  /** Nombre de tentatives (backoff exponentiel). */
  attempts: number;
  /** Epoch ms avant laquelle on ne retente pas (backoff). */
  nextAttemptAt: number;
  /** Dernière erreur (HTTP status ou message réseau). */
  lastError?: string | null;
  /** HTTP status de la dernière réponse (utile pour distinguer permanent/évolutif). */
  lastStatus?: number | null;
  /** Dernière réponse serveur (pour diagnostic). */
  lastResponse?: unknown;
  /** Si true, l'action est sensible et ne peut être créée qu'en ligne. */
  onlineOnly?: boolean;
}

/** Métadonnées de synchro (cursor de pull, dernière synchro…). */
export interface SyncMeta {
  key: string;
  value: unknown;
}

/** Résultat d'un flush de la file. */
export interface FlushResult {
  synced: number;
  failed: number;
  pending: number;
  conflicts: number;
}

/** Résultat d'un pull delta. */
export interface PullResult {
  /** Nombre d'enregistrements appliqués localement. */
  applied: number;
  /** Nouveau curseur (timestamp serveur). */
  cursor: string | null;
  /** Conflits détectés (règle appliquée côté client). */
  conflicts: Array<{ entity: string; recordId: string; rule: string }>;
}

/** Payload d'une mutation envoyée au serveur. */
export interface PushMutation {
  clientMutationId: string;
  entity: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  payload: Record<string, unknown>;
  schoolId: string;
  /** Epoch ms côté client. */
  clientUpdatedAt: number;
}
