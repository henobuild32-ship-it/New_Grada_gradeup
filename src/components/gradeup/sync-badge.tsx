'use client';

import { RefreshCw, CheckCircle2, AlertTriangle, CloudOff } from 'lucide-react';
import type { SyncStatus } from '@/lib/offline/types';

/**
 * Badge compact « non synchronisé » à afficher sur une carte/ligne quand le
 * record n'est pas `synced`. L'UI reste utilisable hors ligne : le badge
 * indique simplement que l'élément partira au retour du réseau.
 */
export default function SyncBadge({ status }: { status?: SyncStatus | null }) {
  if (!status || status === 'synced') return null;

  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
        <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
        En attente
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        <AlertTriangle className="h-3 w-3" aria-hidden />
        Erreur
      </span>
    );
  }

  if (status === 'conflict') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
        <CloudOff className="h-3 w-3" aria-hidden />
        Conflit
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
      <CheckCircle2 className="h-3 w-3" aria-hidden />
      Synchronisé
    </span>
  );
}
