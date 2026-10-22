'use client';

import { useEffect, useState } from 'react';
import {
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  RotateCcw,
  XCircle,
  HardDrive,
  Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import SyncBadge from '@/components/gradeup/sync-badge';
import { useSyncStore } from '@/lib/sync/engine';
import { useOutboxList, useOutboxCount } from '@/lib/offline/hooks';
import { retryAction, cancelAction, discardAllActions, OUTBOX_EVENTS } from '@/lib/offline/outbox';
import {
  estimateStorage,
  clearLocalCache,
  purgeOldRecords,
} from '@/lib/offline/storage';
import { toast } from 'sonner';

const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente',
  inflight: 'Envoi…',
  error: 'Erreur',
  conflict: 'Conflit',
  done: 'Envoyé',
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} Mo`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} Go`;
}

export default function SyncCenter() {
  const { online, phase, lastSyncAt, lastError, syncNow } = useSyncStore();
  const actions = useOutboxList();
  const counts = useOutboxCount();
  const [storage, setStorage] = useState<{ usage: number; quota: number; ratio: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void estimateStorage().then(setStorage);
  }, []);

  const handleSync = async () => {
    setBusy(true);
    try {
      await syncNow();
      toast.success('Synchronisation lancée');
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async (id: string) => {
    await retryAction(id);
    void syncNow();
  };

  const handleCancel = async (id: string) => {
    await cancelAction(id);
    window.dispatchEvent(new Event(OUTBOX_EVENTS.failed));
    toast.info('Action annulée');
  };

  const handleClearCache = async () => {
    const res = await clearLocalCache();
    toast.success(`Cache vidé (${res.clearedTables} tables, ${res.clearedFiles} fichiers)`);
    void estimateStorage().then(setStorage);
  };

  const handlePurge = async () => {
    const n = await purgeOldRecords();
    toast.success(`${n} enregistrement(s) ancien(s) purgé(s)`);
    void estimateStorage().then(setStorage);
  };

  const handleDiscardAll = async () => {
    const n = await discardAllActions();
    toast.info(`${n} action(s) oubliée(s)`);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Centre de synchronisation</h1>
          <p className="text-xs text-muted-foreground">
            Gérez les actions en attente, les erreurs et le stockage hors ligne.
          </p>
        </div>
        <Button size="sm" onClick={handleSync} disabled={busy || !online}>
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          Synchroniser
        </Button>
      </div>

      {/* Statut global */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {online ? <Wifi className="h-5 w-5 text-emerald-600" /> : <WifiOff className="h-5 w-5 text-amber-500" />}
            <div>
              <p className="text-sm font-semibold">{online ? 'En ligne' : 'Hors ligne'}</p>
              <p className="text-xs text-muted-foreground">
                {phase === 'syncing' ? 'Synchronisation en cours…' : lastSyncAt ? `Dernière synchro : ${new Date(lastSyncAt).toLocaleTimeString('fr-FR')}` : 'Pas encore synchronisé'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold">{counts.pending}</p>
            <p className="text-[11px] text-muted-foreground">en attente</p>
          </div>
        </CardContent>
      </Card>

      {lastError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {lastError}
        </div>
      )}

      {/* Actions en attente */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" /> Actions ({actions.length})
          </CardTitle>
          <CardDescription className="text-xs">
            Chaque mutation est envoyée dans l&apos;ordre avec un identifiant unique (pas de doublon).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {actions.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
              <p className="text-sm font-medium">Tout est synchronisé</p>
              <p className="text-xs text-muted-foreground">Aucune action en attente.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {actions.map((a) => (
                <li key={a.clientMutationId} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold capitalize">{a.entity}</span>
                      <SyncBadge
                        status={
                          a.status === 'inflight' ? 'pending' : a.status === 'done' ? 'synced' : a.status
                        }
                      />
                      <span className="text-[10px] text-muted-foreground">{STATUS_LABEL[a.status] ?? a.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {a.method} {a.endpoint}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {new Date(a.createdAt).toLocaleString('fr-FR')} · {a.attempts} tentative(s)
                    </p>
                    {a.lastError && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{a.lastError}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {(a.status === 'error' || a.status === 'conflict' || a.status === 'pending') && (
                      <Button variant="outline" size="sm" className="h-11 w-11 p-0" title="Réessayer" onClick={() => handleRetry(a.clientMutationId)}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-11 w-11 p-0 text-red-600" title="Annuler" onClick={() => handleCancel(a.clientMutationId)}>
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Stockage */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <HardDrive className="h-4 w-4" /> Stockage local
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {storage && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Utilisé</span>
                <span className="font-medium">
                  {formatBytes(storage.usage)} / {formatBytes(storage.quota)} ({Math.round(storage.ratio * 100)}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full ${storage.ratio > 0.85 ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(100, Math.round(storage.ratio * 100))}%` }}
                />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handlePurge}>
              Purger les données anciennes
            </Button>
            <Button variant="outline" size="sm" onClick={handleClearCache} className="text-red-600">
              <Trash2 className="h-4 w-4" /> Vider le cache local
            </Button>
            {actions.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleDiscardAll} className="text-muted-foreground">
                Oublier toutes les actions
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            « Vider le cache local » supprime les données téléchargées et les fichiers hors ligne, mais conserve
            les actions non synchronisées pour ne rien perdre.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
