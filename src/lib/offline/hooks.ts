'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef } from 'react';
import { getLocalDB, type EntityName } from './db';
import type { LocalRecord } from './types';
import { readLocal, refreshRemote, mutateLocalFirst, type MutationOptions } from './repository';

/**
 * Hooks React pour la couche offline (local-first).
 *
 * `useEntityList` : live query Dexie sur une table → l'UI se met à jour
 * automatiquement quand la base locale change (y compris pendant un flush).
 * Un rafraîchissement réseau est déclenché en arrière-plan si en ligne.
 */

export interface UseEntityOptions {
  /** URL GET pour rafraîchir en arrière-plan (stale-while-revalidate). */
  remoteUrl?: string;
  /** Filtre local (par ex. non supprimé, par élève…). */
  filter?: (rec: LocalRecord) => boolean;
  /** Désactive le rafraîchissement automatique (lecture pure locale). */
  skipRefresh?: boolean;
}

/**
 * Liste live d'une entité pour une école. Retourne [] tant que la DB n'est
 * pas prête (SSR-safe). Rafraîchit en arrière-plan si `remoteUrl` fourni.
 */
export function useEntityList<T extends LocalRecord = LocalRecord>(
  entity: EntityName,
  schoolId: string | undefined | null,
  options: UseEntityOptions = {}
): T[] {
  const { remoteUrl, filter, skipRefresh } = options;
  const filterKey = filter ? filter.toString() : '';

  // Live query : se ré-exécute à chaque écriture dans la table.
  const rows = useLiveQuery(
    async () => {
      if (!schoolId) return [] as T[];
      return readLocal<T>(entity, schoolId, filter as ((r: T) => boolean) | undefined);
    },
    [entity, schoolId, filterKey],
    [] as T[]
  ) as T[];

  // Stale-while-revalidate : rafraîchir en arrière-plan une fois au mount.
  const refresh = useCallback(() => {
    if (!schoolId || !remoteUrl || skipRefresh) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    void refreshRemote(entity, remoteUrl, schoolId);
  }, [entity, schoolId, remoteUrl, skipRefresh]);

  const called = useRef(false);
  useEffect(() => {
    if (!called.current) {
      called.current = true;
      refresh();
    }
  }, [refresh]);

  return rows ?? [];
}

/**
 * Mutation local-first depuis un composant : écrit en local, enqueue,
 * tente d'envoyer. `mutate` est stable.
 */
export function useEntityMutation<T extends LocalRecord = LocalRecord>(
  entity: EntityName,
  options: MutationOptions
) {
  const { schoolId, role, endpoint, method, onlineOnly } = options;
  const mutate = useCallback(
    async (
      operation: 'create' | 'update' | 'delete',
      record: Partial<T> & { id?: string; schoolId: string }
    ) => mutateLocalFirst<T>(entity, operation, record, { schoolId, role, endpoint, method, onlineOnly }),
    [entity, schoolId, role, endpoint, method, onlineOnly]
  );
  return { mutate };
}

/**
 * Compteur live d'actions en attente dans l'outbox.
 */
export function useOutboxCount(): { pending: number; error: number; conflict: number; total: number } {
  const counts = useLiveQuery(
    async () => {
      const db = getLocalDB();
      const all = await db.outbox.toArray();
      return {
        pending: all.filter((a) => a.status === 'pending' || a.status === 'inflight').length,
        error: all.filter((a) => a.status === 'error').length,
        conflict: all.filter((a) => a.status === 'conflict').length,
        total: all.length,
      };
    },
    [],
    { pending: 0, error: 0, conflict: 0, total: 0 }
  ) as { pending: number; error: number; conflict: number; total: number };
  return counts ?? { pending: 0, error: 0, conflict: 0, total: 0 };
}

/** Liste live des actions de l'outbox (pour le centre de synchronisation). */
export function useOutboxList() {
  const actions = useLiveQuery(
    async () => {
      const db = getLocalDB();
      return db.outbox.orderBy('createdAt').reverse().limit(100).toArray();
    },
    [],
    []
  );
  return actions ?? [];
}
