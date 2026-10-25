'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, BookOpen, Check, Clock3, Copy, DollarSign, Loader2, LockKeyhole, RefreshCw, ShieldAlert, UserRoundX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

type CodeRole = 'LECTEUR' | 'CAISSIER';
type CodeAccount = { id: string; fullName: string; createdAt: string; lastActivityAt: string | null };
type RoleCode = { role: CodeRole; code: string; count: number; suspended: boolean; rotateAt: string | null; accounts: CodeAccount[] };

const roleText: Record<CodeRole, string> = { LECTEUR: 'Lecteur', CAISSIER: 'Caissier(ère)' };

function countdown(rotateAt: string | null, now: number) {
  if (!rotateAt) return '';
  const seconds = Math.max(0, Math.floor((new Date(rotateAt).getTime() - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return `${hours} h ${String(minutes).padStart(2, '0')} min ${String(remaining).padStart(2, '0')} s`;
}

export default function ConfidentialCodesCard() {
  const [codes, setCodes] = useState<RoleCode[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [copiedRole, setCopiedRole] = useState<CodeRole | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!navigator.onLine) { setOnline(false); return; }
    try {
      const response = await fetch('/api/admin/confidential-codes', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Les codes ne peuvent pas être chargés.');
      setCodes(Array.isArray(data.roles) ? data.roles : []);
      setLastSync(new Date(data.serverTime || Date.now()));
      setError('');
      setOnline(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Les codes ne peuvent pas être chargés.');
    }
  }, []);

  useEffect(() => {
    const sync = () => { setOnline(true); void refresh(); };
    const offline = () => setOnline(false);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener('online', sync);
    window.addEventListener('offline', offline);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(timer);
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', offline);
    };
  }, [refresh]);

  const orderedCodes = useMemo(() => (['LECTEUR', 'CAISSIER'] as CodeRole[]).map((role) => codes.find((item) => item.role === role)).filter((item): item is RoleCode => Boolean(item)), [codes]);

  const copyCode = async (item: RoleCode) => {
    try {
      await navigator.clipboard.writeText(item.code);
      setCopiedRole(item.role);
      toast.success(`Code ${roleText[item.role]} copié.`);
      window.setTimeout(() => setCopiedRole(null), 1800);
    } catch {
      toast.error('Le presse-papiers est inaccessible sur cet appareil.');
    }
  };

  const resetCode = async (role: CodeRole) => {
    if (!window.confirm('Cette action déconnecte immédiatement les personnes connectées avec ce code et génère un nouveau code.')) return;
    setBusy(`reset:${role}`);
    try {
      const response = await fetch('/api/admin/confidential-codes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset', role }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'La réinitialisation a échoué.');
      await refresh();
      toast.success(`Code ${roleText[role]} réinitialisé. Les anciennes sessions ont été révoquées.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'La réinitialisation a échoué.');
    } finally {
      setBusy(null);
    }
  };

  const disableAccount = async (item: RoleCode, account: CodeAccount) => {
    if (!window.confirm(`Désactiver le compte de ${account.fullName} et libérer sa place ?`)) return;
    setBusy(`disable:${account.id}`);
    try {
      const response = await fetch('/api/admin/confidential-codes', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: account.id, role: item.role }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'La désactivation a échoué.');
      await refresh();
      toast.success('Compte désactivé. Sa session est révoquée et la place est libérée.');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'La désactivation a échoué.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm dark:border-slate-800">
      <CardHeader className="gap-3 border-b bg-gradient-to-r from-slate-50 to-sky-50/70 dark:from-slate-900 dark:to-sky-950/20 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><LockKeyhole className="size-5 text-sky-700" /> Codes de confidentialité</CardTitle>
          <CardDescription className="mt-1 max-w-3xl">Codes propres à l’école pour l’inscription Lecteur et Caissier(ère). Ils sont secrets et ne sont montrés qu’à l’administrateur.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy !== null} className="min-h-10 shrink-0 rounded-xl">
          <RefreshCw className="mr-2 size-4" /> Actualiser
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {!online && lastSync && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Dernière synchronisation à {lastSync.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — ce code a peut-être changé. La réinitialisation exige une connexion.</div>}
        {error && codes.length === 0 && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="grid gap-4 xl:grid-cols-2">
          {orderedCodes.map((item) => {
            const Icon = item.role === 'LECTEUR' ? BookOpen : DollarSign;
            return (
              <section key={item.role} className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200"><Icon className="size-5" /></span><div><h3 className="font-bold">{roleText[item.role]}</h3><p className="text-xs text-muted-foreground">Code réservé à ce rôle</p></div></div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.suspended ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'}`}>
                    {item.suspended ? `Suspendu${item.count < 2 ? ` · ${item.count}/2` : ' 2/2'}` : `Actif ${item.count}/2`}
                  </span>
                </div>

                <div className="mt-4 flex min-w-0 items-center justify-between gap-2 rounded-xl border bg-muted/30 p-3">
                  <code className="min-w-0 break-all font-mono text-base font-bold tracking-widest text-foreground sm:text-lg">{item.code}</code>
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyCode(item)} className="min-h-10 shrink-0 rounded-lg" disabled={!online}>
                    {copiedRole === item.role ? <Check className="mr-1.5 size-4" /> : <Copy className="mr-1.5 size-4" />} Copier
                  </Button>
                </div>

                <div className="mt-3 flex min-h-6 items-center gap-2 text-xs text-muted-foreground">
                  {item.suspended ? <><ShieldAlert className="size-4 text-amber-600" /> Le code reste suspendu jusqu’à sa réinitialisation.</>
                    : <><Clock3 className="size-4" /> Renouvellement dans {countdown(item.rotateAt, now)}.</>}
                </div>

                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Comptes actifs · {item.count}/2</p>
                  {item.accounts.length === 0 ? <p className="rounded-lg bg-muted/30 px-3 py-3 text-xs text-muted-foreground">Aucun compte pour ce code.</p> : item.accounts.map((account) => (
                    <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-3">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold">{account.fullName}</p><p className="mt-0.5 text-xs text-muted-foreground">Inscrit le {new Date(account.createdAt).toLocaleDateString('fr-FR')} · Dernière activité {account.lastActivityAt ? new Date(account.lastActivityAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'pas encore observée'}</p></div>
                      <Button variant="outline" size="sm" onClick={() => void disableAccount(item, account)} disabled={!online || busy !== null} className="min-h-10 shrink-0 rounded-lg text-destructive hover:text-destructive"><UserRoundX className="mr-1.5 size-4" /> Désactiver</Button>
                    </div>
                  ))}
                </div>

                <Button variant="outline" onClick={() => void resetCode(item.role)} disabled={!online || busy !== null} className="mt-4 min-h-11 w-full rounded-xl border-slate-300 font-semibold">
                  {busy === `reset:${item.role}` ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />} Réinitialiser le code
                </Button>
              </section>
            );
          })}
        </div>
        <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs leading-relaxed text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
          <BadgeCheck className="mt-0.5 size-4 shrink-0 text-sky-700" /> À donner en personne à la personne concernée. Ce code est secret. Il est suspendu quand 2 comptes sont créés.
        </div>
        {!online && codes.length === 0 && <div role="status" className="text-xs text-muted-foreground">Les codes ne sont disponibles hors ligne qu’après leur chargement dans cette session.</div>}
      </CardContent>
    </Card>
  );
}
