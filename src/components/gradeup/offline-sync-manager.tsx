'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CloudOff, RefreshCw, Wifi, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { useSyncStore } from '@/lib/sync/engine';
import { useOutboxCount } from '@/lib/offline/hooks';
import { OUTBOX_EVENTS } from '@/lib/offline/outbox';

/**
 * Indicateur global de synchronisation + déclencheur du moteur.
 *
 * États affichés : En ligne / Hors ligne / Synchronisation en cours /
 * N actions en attente / Erreur. Monté une seule fois dans le layout.
 */
export default function OfflineSyncManager() {
  const { online, phase, start, syncNow } = useSyncStore();
  const counts = useOutboxCount();
  const [recentlySynced, setRecentlySynced] = useState(false);

  // Démarrer le moteur (ticks, listeners online/offline, Background Sync).
  useEffect(() => {
    start();
    const onSynced = () => {
      setRecentlySynced(true);
      window.setTimeout(() => setRecentlySynced(false), 2500);
    };
    window.addEventListener(OUTBOX_EVENTS.synced, onSynced);
    // Message du service worker (Background Sync).
    const onSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_OUTBOX') void syncNow();
    };
    navigator.serviceWorker?.addEventListener('message', onSWMessage);
    return () => {
      window.removeEventListener(OUTBOX_EVENTS.synced, onSynced);
      navigator.serviceWorker?.removeEventListener('message', onSWMessage);
    };
  }, [start, syncNow]);

  const hasIssue = counts.error > 0 || counts.conflict > 0;
  const isSyncing = phase === 'syncing';
  const hasPending = counts.pending > 0;

  // Rien à afficher si en ligne, synchro propre et sans action en attente.
  if (online && !isSyncing && !hasPending && !hasIssue && !recentlySynced) return null;

  let icon = <Wifi className="h-3.5 w-3.5 text-emerald-600" aria-hidden />;
  let label = 'En ligne';
  if (!online) {
    icon = <CloudOff className="h-3.5 w-3.5 text-amber-500" aria-hidden />;
    label = 'Mode hors ligne';
  } else if (hasIssue) {
    icon = <AlertTriangle className="h-3.5 w-3.5 text-red-500" aria-hidden />;
    label = counts.conflict > 0 ? `${counts.conflict} conflit(s)` : `${counts.error} erreur(s)`;
  } else if (isSyncing || recentlySynced) {
    icon = <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" aria-hidden />;
    label = recentlySynced ? 'Synchronisé' : 'Synchronisation…';
  } else if (hasPending) {
    icon = <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" aria-hidden />;
    label = `${counts.pending} action(s) en attente`;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs shadow-lg"
    >
      {icon}
      <span>{label}</span>
      {hasIssue && (
        <Link href="/?page=sync-center" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">
          Voir <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      )}
      {!online && (
        <button
          type="button"
          onClick={() => window.open('/offline', '_blank')}
          className="text-[11px] text-muted-foreground hover:underline"
        >
          Aide
        </button>
      )}
    </div>
  );
}
