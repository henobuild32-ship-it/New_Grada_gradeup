'use client';

import { useCallback, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import type { PaymentInfo } from '@/lib/types';
import type { LocalRecord } from '@/lib/offline/types';
import { useEntityListState } from '@/lib/offline/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CreditCard, CheckCircle, Clock, AlertCircle, Receipt, RefreshCw } from 'lucide-react';

type LocalPayment = PaymentInfo & LocalRecord;

function extractPayments(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== 'object') return [];
  const payments = (data as { payments?: unknown }).payments;
  return Array.isArray(payments) ? payments as Record<string, unknown>[] : [];
}

export default function StudentPayments() {
  const user = useAppStore((s) => s.user);
  const paymentFilter = useCallback(
    (record: LocalRecord) => (record as LocalPayment).studentId === user?.id,
    [user?.id]
  );
  const params = user?.schoolId && user?.id
    ? new URLSearchParams({ schoolId: user.schoolId, studentId: user.id }).toString()
    : null;
  const { data: cachedPayments, loading, refreshing, error, refresh } = useEntityListState<LocalPayment>(
    'payments',
    user?.schoolId,
    {
      remoteUrl: params ? `/api/payments?${params}` : undefined,
      extract: extractPayments,
      filter: paymentFilter,
    }
  );
  const payments = useMemo(
    () => [...cachedPayments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [cachedPayments]
  );
  const loadError = user?.id
    ? error
    : 'Votre session élève est indisponible. Reconnectez-vous puis réessayez.';
  const fetchPayments = useCallback(async () => {
    if (user?.schoolId && user?.id) await refresh();
  }, [refresh, user?.id, user?.schoolId]);

  const paidCount = payments.filter((p) => p.status === 'paid').length;
  const pendingCount = payments.filter((p) => p.status === 'pending').length;
  const overdueCount = payments.filter((p) => p.status === 'overdue' || p.status === 'late').length;
  const currency = user?.school?.currency || 'USD';
  const paidTotalsByCurrency = payments
    .filter((payment) => payment.status === 'paid')
    .reduce<Record<string, number>>((totals, payment) => {
      const paymentCurrency = payment.currency || currency;
      totals[paymentCurrency] = (totals[paymentCurrency] || 0) + payment.amount;
      return totals;
    }, {});

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1"><CheckCircle className="h-3 w-3" />Payé</Badge>;
      case 'pending': return <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1"><Clock className="h-3 w-3" />En attente</Badge>;
      case 'overdue':
      case 'late': return <Badge className="bg-red-100 text-red-700 border-red-200 gap-1"><AlertCircle className="h-3 w-3" />En retard</Badge>;
      case 'cancelled': return <Badge variant="secondary">Annulé</Badge>;
      default: return <Badge variant="secondary">Statut : {status}</Badge>;
    }
  };

  const getStatusIcon = () => {
    if (overdueCount > 0) return <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100"><AlertCircle className="h-8 w-8 text-red-600" /></div>;
    if (pendingCount > 0) return <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100"><Clock className="h-8 w-8 text-amber-600" /></div>;
    return <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100"><CheckCircle className="h-8 w-8 text-emerald-600" /></div>;
  };

  const getStatusText = () => {
    if (overdueCount > 0) return 'Paiements en retard';
    if (pendingCount > 0) return 'Paiements en attente';
    if (payments.length > 0) return 'Tous les paiements sont à jour';
    return 'Aucun paiement enregistré';
  };

  const getStatusDescription = () => {
    if (overdueCount > 0) return `Vous avez ${overdueCount} paiement(s) en retard. Veuillez régulariser votre situation.`;
    if (pendingCount > 0) return `Vous avez ${pendingCount} paiement(s) en attente de traitement.`;
    if (payments.length > 0) {
      const totals = Object.entries(paidTotalsByCurrency)
        .map(([paidCurrency, amount]) => `${amount.toLocaleString('fr-FR')} ${paidCurrency}`);
      const totalLabel = totals.length ? totals.join(' · ') : 'aucun montant réglé';
      return `Vous avez effectué ${paidCount} paiement(s), pour un total de ${totalLabel}.`;
    }
    return 'Aucun paiement n\'a été enregistré pour le moment.';
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-24 rounded-xl" /><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (loadError && payments.length === 0 && !loading) {
    return <ErrorState title="Paiements indisponibles" description={loadError} onRetry={() => void fetchPayments()} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="mb-6 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-6">
        <h1 className="text-2xl font-bold">Mes paiements</h1>
        <p className="text-sm text-muted-foreground mt-1">Suivez l&apos;état de vos paiements scolaires</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void fetchPayments()} disabled={refreshing} className="mt-3 min-h-11 gap-2">
          <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} /> Actualiser
        </Button>
      </div>

      {loadError && payments.length > 0 && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          Affichage des données enregistrées sur cet appareil. {loadError}
        </div>
      )}

      {/* Status Card */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 shadow-sm">
        <CardContent className="flex items-center gap-6">
          {getStatusIcon()}
          <div className="flex-1">
            <h3 className="text-xl font-bold">{getStatusText()}</h3>
            <p className="text-sm text-muted-foreground mt-1">{getStatusDescription()}</p>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <div className="text-center p-2 rounded-lg bg-white/60">
              <p className="text-lg font-bold text-emerald-600">{paidCount}</p>
              <p className="text-xs text-muted-foreground">Payé(s)</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-white/60">
              <p className="text-lg font-bold text-amber-600">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">En attente</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-white/60">
              <p className="text-lg font-bold text-red-600">{overdueCount}</p>
              <p className="text-xs text-muted-foreground">En retard</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Receipt className="h-5 w-5 text-blue-500" />Historique des paiements</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <EmptyState icon={CreditCard} title="Aucun paiement enregistré" description="L’historique de vos versements apparaîtra ici." className="py-10" />
          ) : (
            <>
              <div className="hidden md:block">
            <ScrollArea className="max-h-96">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30"><TableHead className="pl-6">Mois</TableHead><TableHead className="text-center">Montant</TableHead><TableHead className="text-center">Statut</TableHead><TableHead className="hidden sm:table-cell text-center">Méthode</TableHead><TableHead className="hidden sm:table-cell">Date</TableHead></TableRow>
                </TableHeader>
                <TableBody className="[&>tr:nth-child(even)]:bg-muted/30">
                  {payments.map((payment) => (
                    <TableRow key={payment.id} className="hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors">
                      <TableCell className="pl-6 font-medium">{payment.month}</TableCell>
                      <TableCell className="text-center font-bold">{payment.amount.toLocaleString('fr-FR')} <span className="text-muted-foreground font-normal">{payment.currency || currency}</span></TableCell>
                      <TableCell className="text-center">{getStatusBadge(payment.status)}</TableCell>
                      <TableCell className="hidden sm:table-cell text-center text-muted-foreground">{payment.method || '—'}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">{formatDate(payment.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
              </div>
              <div className="space-y-3 p-3 md:hidden" aria-label="Historique des paiements">
                {payments.map((payment) => (
                  <article key={payment.id} className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{payment.month || 'Versement scolaire'}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDate(payment.createdAt)}</p>
                      </div>
                      {getStatusBadge(payment.status)}
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <span className="text-xs text-muted-foreground">{payment.method || 'Mode non indiqué'}</span>
                      <span className="text-lg font-bold tabular-nums">
                        {payment.amount.toLocaleString('fr-FR')} <span className="text-sm font-normal text-muted-foreground">{payment.currency || currency}</span>
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
