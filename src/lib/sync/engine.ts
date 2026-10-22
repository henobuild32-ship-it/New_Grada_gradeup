import { create } from 'zustand';
import { getLocalDB } from '@/lib/offline/db';
import { flushOutbox, listActions, OUTBOX_EVENTS } from '@/lib/offline/outbox';
import { applyRemoteList } from '@/lib/offline/repository';
import type { EntityName } from '@/lib/offline/db';
import type { OutboxAction } from '@/lib/offline/types';

/**
 * Moteur de synchronisation client.
 *
 * Déclencheurs : au retour du réseau, à l'ouverture, périodiquement,
 * et via Background Sync quand disponible. Pull delta via /api/sync/pull.
 * Realtime (Supabase) pour rafraîchir en ligne.
 */

export type SyncPhase = 'idle' | 'syncing' | 'error';

interface SyncState {
  online: boolean;
  phase: SyncPhase;
  pending: number;
  errors: number;
  conflicts: number;
  lastSyncAt: number | null;
  lastError: string | null;
  start: () => void;
  stop: () => void;
  syncNow: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => {
  let timer: number | null = null;
  let started = false;

  async function tick() {
    const state = get();
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      set({ online: false, phase: 'idle' });
      return;
    }
    set({ online: true, phase: 'syncing' });
    try {
      // 1) Pousser l'outbox.
      const flush = await flushOutbox();
      // 2) Tirer le delta serveur.
      const pullApplied = await pullDelta();
      const actions = await listActions();
      const pending = actions.filter((a) => a.status === 'pending' || a.status === 'inflight').length;
      const errors = actions.filter((a) => a.status === 'error').length;
      const conflicts = actions.filter((a) => a.status === 'conflict').length;
      set({
        phase: errors > 0 || conflicts > 0 ? 'error' : 'idle',
        pending,
        errors,
        conflicts,
        lastSyncAt: Date.now(),
        lastError: errors > 0 ? 'Certaines actions ont échoué' : null,
      });
    } catch (e) {
      set({
        phase: 'error',
        lastError: e instanceof Error ? e.message : 'Erreur de synchronisation',
      });
    }
  }

  return {
    // NB : `navigator` existe dans Node >= 21 — on teste `window` pour le SSR.
    online: typeof window === 'undefined' ? true : navigator.onLine,
    phase: 'idle',
    pending: 0,
    errors: 0,
    conflicts: 0,
    lastSyncAt: null,
    lastError: null,
    start() {
      if (started || typeof window === 'undefined') return;
      started = true;
      const onOnline = () => {
        set({ online: true });
        void tick();
      };
      const onOffline = () => set({ online: false, phase: 'idle' });
      const onQueued = () => {
        void listActions().then((actions) => {
          set({
            pending: actions.filter((a) => a.status === 'pending' || a.status === 'inflight').length,
          });
        });
      };
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      window.addEventListener(OUTBOX_EVENTS.queued, onQueued);
      // Tick périodique (30 s).
      timer = window.setInterval(() => void tick(), 30_000);
      // Premier tick à l'ouverture.
      void tick();
      // Background Sync via le service worker si dispo.
      registerBackgroundSync();
      (get() as SyncState & { _cleanup?: () => void })._cleanup = () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
        window.removeEventListener(OUTBOX_EVENTS.queued, onQueued);
        if (timer) window.clearInterval(timer);
      };
    },
    stop() {
      const s = get() as SyncState & { _cleanup?: () => void };
      if (s._cleanup) s._cleanup();
      started = false;
    },
    async syncNow() {
      await tick();
    },
  };
});

/** Curseur de pull stocké dans syncMeta. */
async function getCursor(): Promise<string | null> {
  const db = getLocalDB();
  const meta = await db.syncMeta.get('pullCursor');
  return (meta?.value as string) ?? null;
}

async function setCursor(cursor: string): Promise<void> {
  const db = getLocalDB();
  await db.syncMeta.put({ key: 'pullCursor', value: cursor });
}

/** Applique le delta serveur à la base locale. */
async function pullDelta(): Promise<number> {
  const since = await getCursor();
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  const res = await fetch(`/api/sync/pull?${params.toString()}`, { credentials: 'include' });
  if (!res.ok) return 0;
  const data = (await res.json()) as {
    cursor?: string | null;
    entities?: Record<string, Record<string, unknown>[]>;
  };
  let applied = 0;
  if (data.entities) {
    for (const [entity, records] of Object.entries(data.entities)) {
      if (!Array.isArray(records) || records.length === 0) continue;
      const schoolId = String(records[0]?.schoolId ?? '');
      if (!schoolId) continue;
      applied += await applyRemoteList(entity as EntityName, records, schoolId);
    }
  }
  if (data.cursor) await setCursor(data.cursor);
  return applied;
}

/** Enregistre Background Sync (Chrome) pour pousser la file hors onglet. */
function registerBackgroundSync() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => {
      const anyReg = reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } };
      if (anyReg.sync?.register) {
        void anyReg.sync.register('gradeup-outbox').catch(() => {
          /* Background Sync non supporté : le tick périodique suffit. */
        });
      }
    })
    .catch(() => {
      /* ignore */
    });
}

/** Demande au service worker de synchroniser (message). */
export function requestSWOutboxSync() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => reg.active?.postMessage({ type: 'SYNC_OUTBOX' }))
    .catch(() => {});
}
