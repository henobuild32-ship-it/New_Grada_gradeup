'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Clock3, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type AuditRecord = { id: string; action: string; entity: string; createdAt: string; user: { id: string; fullName: string; role: string } };

const actionLabel: Record<string, string> = {
  CREATE: 'Création', UPDATE: 'Mise à jour', DELETE: 'Suppression', USER_CREATE: 'Compte créé', USER_UPDATE: 'Compte modifié',
  USER_DISABLE: 'Compte désactivé', USER_DELETE: 'Compte supprimé', CONFIDENTIAL_CODE_CREATED: 'Code de rôle créé',
  CONFIDENTIAL_CODE_ROTATED: 'Code renouvelé', CONFIDENTIAL_CODE_RESET: 'Code réinitialisé',
  CONFIDENTIAL_ACCOUNT_DISABLED: 'Accès désactivé', CONFIDENTIAL_CODE_REGISTERED: 'Inscription validée',
  CONFIDENTIAL_CODE_REGISTER_FAILED: 'Inscription refusée', PAYMENT_CREATE: 'Paiement créé', PAYMENT_UPDATE: 'Paiement modifié',
  GRADE_VALIDATE: 'Notes validées', GRADE_MODIFY_REQUEST: 'Modification de notes demandée', GRADE_MODIFY_APPROVE: 'Modification de notes approuvée',
  BULLETIN_PUBLISH: 'Bulletin publié', ATTENDANCE_JUSTIFY: 'Absence justifiée', YEAR_CLOSE: 'Année clôturée', LOGIN: 'Connexion', LOGOUT: 'Déconnexion',
};

export default function ReaderAudit() {
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/audit-logs?limit=100', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Le journal ne peut pas être chargé.');
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Le journal ne peut pas être chargé.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">Consultation en lecture seule</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Journal d’audit</h1>
          <p className="mt-1 text-sm text-muted-foreground">Les 100 activités les plus récentes de votre établissement.</p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} className="min-h-11 rounded-xl"><RefreshCw className="mr-2 size-4" /> Actualiser</Button>
      </header>

      <Card className="overflow-hidden rounded-2xl">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="flex items-center gap-2 text-base"><Activity className="size-5 text-sky-600" /> Activités enregistrées</CardTitle>
          <CardDescription>Les détails privés et les codes confidentiels sont masqués.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <div className="p-6 text-sm text-muted-foreground">Chargement du journal…</div>
            : error ? <div role="alert" className="flex items-center gap-3 p-6 text-sm text-destructive"><ShieldAlert className="size-5 shrink-0" />{error}</div>
            : logs.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Aucune activité enregistrée.</div>
            : <ol className="divide-y">
              {logs.map((record) => (
                <li key={record.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-6">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200"><Activity className="size-4" /></span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{actionLabel[record.action] || record.action.replaceAll('_', ' ').toLowerCase()}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{record.user.fullName} · {record.user.role} · {record.entity}</p>
                    </div>
                  </div>
                  <time className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" dateTime={record.createdAt}>
                    <Clock3 className="size-3.5" />{new Date(record.createdAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                  </time>
                </li>
              ))}
            </ol>}
        </CardContent>
      </Card>
    </div>
  );
}
