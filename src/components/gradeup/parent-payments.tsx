'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import type { UserInfo, PaymentInfo } from '@/lib/types';
import { useEntityListState } from '@/lib/offline/hooks';
import { useParentChildren } from '@/lib/offline/parent-children';
import { usePersistedChildSelection } from '@/lib/offline/child-selection';
import type { PaymentRecord } from '@/lib/offline/db';
import type { LocalRecord } from '@/lib/offline/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  CreditCard, CheckCircle2, Clock, AlertTriangle, CircleDollarSign, CalendarDays, Wallet,
  RefreshCw,
  Download, Receipt, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getLocalDB } from '@/lib/offline/db';

interface TuitionSnapshot {
  id: string;
  paymentStatus: string;
  balances: Array<{ currency: string; due: number; paid: number; remaining: number; coverage: number }>;
  fees: Array<{ name: string; amount: number; currency: string; dueDate: string }>;
  installments: Array<{ id: string; label: string; amount: number; currency: string; dueDate: string; status: string; isOverdue: boolean }>;
}

function extractPayments(data: unknown): Record<string, unknown>[] {
  if (typeof data !== 'object' || data === null || !('payments' in data)) return [];
  const payments = (data as { payments?: unknown }).payments;
  return Array.isArray(payments)
    ? payments.filter((payment): payment is Record<string, unknown> => typeof payment === 'object' && payment !== null)
    : [];
}

export default function ParentPayments() {
  const { user } = useAppStore();
  const schoolId = user?.schoolId || '';
  const currency = user?.school?.currency || 'FCFA';
  const childrenState = useParentChildren(user?.role === 'PARENT' ? user.id : undefined, schoolId);
  const children = childrenState.data as unknown as UserInfo[];
  const { selectedChildId, selectChild } = usePersistedChildSelection(user?.id ?? '', children.map((child) => child.id));
  const paymentFilter = useCallback(
    (record: LocalRecord) => (record as PaymentRecord).studentId === selectedChildId,
    [selectedChildId]
  );
  const paymentsState = useEntityListState<PaymentRecord>('payments', schoolId, {
    remoteUrl: selectedChildId
      ? `/api/payments?schoolId=${encodeURIComponent(schoolId)}&studentId=${encodeURIComponent(selectedChildId)}`
      : undefined,
    extract: extractPayments,
    filter: paymentFilter,
  });
  const payments = paymentsState.data as unknown as PaymentInfo[];
  const loadingChildren = childrenState.loading;
  const loading = paymentsState.loading;

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedChildId),
    [children, selectedChildId]
  );

  const [tuitionSnapshot, setTuitionSnapshot] = useState<TuitionSnapshot | null>(null);
  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedChildId || !schoolId) return;
    let cancelled = false;
    const loadBalance = async () => {
      try {
        const response = await fetch(`/api/tuition?studentId=${encodeURIComponent(selectedChildId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de charger le solde.');
        const row = Array.isArray(data.students) ? data.students.find((item: TuitionSnapshot) => item.id === selectedChildId) : null;
        if (!row) throw new Error('Solde scolaire introuvable.');
        try { localStorage.setItem(`gradeup:tuition:${user?.id}:${selectedChildId}`, JSON.stringify(row)); } catch { /* le rendu en ligne reste disponible sans persistance */ }
        if (!cancelled) setTuitionSnapshot(row);
      } catch {
        try {
          const saved = localStorage.getItem(`gradeup:tuition:${user?.id}:${selectedChildId}`);
          if (!cancelled && saved) setTuitionSnapshot(JSON.parse(saved) as TuitionSnapshot);
        } catch { /* snapshot absente ou invalide */ }
      }
    };
    void loadBalance();
    return () => { cancelled = true; };
  }, [selectedChildId, schoolId, user?.id]);

  const paidPayments = Array.isArray(payments) ? payments.filter(p => p.status === 'paid') : [];
  const pendingPayments = Array.isArray(payments) ? payments.filter(p => p.status === 'pending') : [];
  const overduePayments = Array.isArray(payments) ? payments.filter(p => p.status === 'overdue' || p.status === 'late') : [];
  const sumByCurrency = (rows: PaymentInfo[]) => {
    const totals = new Map<string, number>();
    rows.forEach((payment) => {
      const key = payment.currency || currency;
      totals.set(key, (totals.get(key) || 0) + payment.amount);
    });
    return [...totals.entries()].map(([unit, amount]) => `${formatAmount(amount)} ${unit}`).join(' · ') || '0';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 gap-1"><CheckCircle2 className="size-3" />Payé</Badge>;
      case 'pending': return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 gap-1"><Clock className="size-3" />En attente</Badge>;
      case 'overdue':
      case 'late': return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 gap-1"><AlertTriangle className="size-3" />En retard</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const formatAmount = (amount: number) => new Intl.NumberFormat('fr-FR').format(amount);

  const downloadReceipt = async (payment: PaymentInfo) => {
    if (payment.status !== 'paid' || !payment.receiptNumber) {
      toast.error('Le reçu officiel sera disponible après confirmation du paiement.');
      return;
    }
    setReceiptBusyId(payment.id);
    try {
      const cacheUrl = `gradeup-parent-receipt:${schoolId}:${payment.id}`;
      const db = getLocalDB();
      let blob = (await db.offlineFiles.get(cacheUrl))?.blob;
      const fileName = `recu-${payment.receiptNumber}.pdf`;
      if (!blob) {
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
        pdf.setFillColor(26, 75, 148); pdf.rect(0, 0, 210, 42, 'F');
        pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17);
        pdf.text(user?.school?.name || 'Établissement scolaire', 20, 20); pdf.setFontSize(12); pdf.text('REÇU OFFICIEL DE PAIEMENT', 20, 32);
        pdf.setTextColor(30, 41, 59); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11);
        pdf.text(`N° ${payment.receiptNumber}`, 20, 58); pdf.text(`Élève : ${selectedChild?.fullName || '—'}`, 20, 72);
        pdf.text(`Période / tranche : ${payment.month || '—'}`, 20, 84);
        pdf.text(`Montant reçu : ${formatAmount(payment.amount)} ${payment.currency || currency}`, 20, 98);
        pdf.text(`Mode : ${payment.method || '—'}`, 20, 110); pdf.text(`Date : ${formatDate(payment.createdAt)}`, 20, 122);
        pdf.setDrawColor(180, 190, 205); pdf.line(20, 143, 190, 143); pdf.setFontSize(9);
        pdf.text('Ce reçu correspond à un paiement confirmé dans GradeUp.', 20, 153);
        blob = pdf.output('blob');
        await db.offlineFiles.put({ url: cacheUrl, fileName, blob, size: blob.size, downloadedAt: Date.now(), schoolId });
      }
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = fileName; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      toast.success(navigator.onLine ? 'Reçu téléchargé et enregistré hors ligne.' : 'Reçu téléchargé depuis le cache hors ligne.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de générer le reçu.');
    } finally { setReceiptBusyId(null); }
  };

  if (!user) return null;

  // Affichage du chargement des enfants
  if (loadingChildren) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="mb-6 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-6">
          <h1 className="text-2xl font-bold">Paiements</h1>
          <p className="text-sm text-muted-foreground mt-1">Suivi des paiements scolaires</p>
        </div>
        <Skeleton className="h-12 w-full max-w-md" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Aucun enfant trouvé
  if (children.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="mb-6 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-6">
          <h1 className="text-2xl font-bold">Paiements</h1>
          <p className="text-sm text-muted-foreground mt-1">Suivi des paiements scolaires</p>
        </div>
        {childrenState.error ? (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-6 text-center text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm">{childrenState.error}</p>
            <button type="button" onClick={() => void childrenState.refresh()} disabled={childrenState.refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium text-foreground disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${childrenState.refreshing ? 'animate-spin' : ''}`} /> Réessayer
            </button>
          </div>
        ) : (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-muted/50">
              <CreditCard className="h-12 w-12 text-muted-foreground/50" />
            </div>
            <p className="text-center text-muted-foreground">Aucun enfant trouvé</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="mb-6 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-6">
        <h1 className="text-2xl font-bold">Paiements</h1>
        <p className="text-sm text-muted-foreground mt-1">Suivi des paiements scolaires</p>
      </div>

      {/* Child selector */}
      {children.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Enfant :</span>
          <Select value={selectedChildId} onValueChange={selectChild}>
            <SelectTrigger className="h-11 w-full transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:w-[200px]">
              <SelectValue placeholder="Sélectionner un enfant" />
            </SelectTrigger>
            <SelectContent>
              {children.map(child => <SelectItem key={child.id} value={child.id}>{child.fullName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {childrenState.error && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {childrenState.error} Les informations déjà enregistrées restent disponibles.
        </p>
      )}

      {paymentsState.error && (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <span>{paymentsState.error}</span>
          <button type="button" onClick={() => void paymentsState.refresh()} disabled={paymentsState.refreshing} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium text-foreground disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${paymentsState.refreshing ? 'animate-spin' : ''}`} /> Réessayer
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !Array.isArray(payments) || payments.length === 0 ? (
        <div className="text-center py-20">
          <div className="mx-auto w-24 h-24 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <CreditCard className="h-12 w-12 text-muted-foreground/50" />
          </div>
          <p className="text-muted-foreground text-center">Aucun paiement trouvé pour {selectedChild?.fullName || 'votre enfant'}</p>
        </div>
      ) : (
        <>
          {/* Payment Overview */}
          <Card className="border-blue-100 bg-gradient-to-r from-blue-50/50 to-white shadow-sm">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="size-4 text-blue-600" />Solde scolaire réel — {selectedChild?.fullName}</div>
              {tuitionSnapshot?.id === selectedChildId && tuitionSnapshot.balances.length > 0 ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tuitionSnapshot.balances.map((balance) => <div key={balance.currency} className="rounded-xl border bg-background p-4">
                  <div className="flex items-center justify-between gap-2"><p className="font-semibold">{balance.currency}</p><span className="text-xs text-muted-foreground">{balance.coverage}% couvert</span></div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-muted-foreground">Dû</dt><dd className="font-semibold">{formatAmount(balance.due)}</dd></div><div><dt className="text-muted-foreground">Payé</dt><dd className="font-semibold text-emerald-700">{formatAmount(balance.paid)}</dd></div><div><dt className="text-muted-foreground">Solde</dt><dd className="font-semibold text-amber-700">{formatAmount(balance.remaining)}</dd></div></dl>
                </div>)}
              </div> : <p className="text-sm text-muted-foreground">{paymentsState.error ? 'Solde non actualisé; les montants affichés ci-dessous sont l’historique des paiements.' : 'Aucun frais configuré pour cet élève.'}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50/80 border border-emerald-100">
                  <div className="size-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Payé</p>
                    <p className="text-sm font-semibold text-emerald-700">{paidPayments.length} · {sumByCurrency(paidPayments)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50/80 border border-amber-100">
                  <div className="size-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <Clock className="size-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">En attente</p>
                    <p className="text-sm font-semibold text-amber-700">{pendingPayments.length} · {sumByCurrency(pendingPayments)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50/80 border border-red-100">
                  <div className="size-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="size-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">En retard</p>
                    <p className="text-sm font-semibold text-red-700">{overduePayments.length} · {sumByCurrency(overduePayments)}</p>
                  </div>
                </div>
              </div>
              {(tuitionSnapshot?.id === selectedChildId && tuitionSnapshot.installments.length > 0) && <div className="space-y-2"><h3 className="text-sm font-semibold">Échéancier</h3><div className="grid gap-2 sm:grid-cols-2">{tuitionSnapshot.installments.map((installment) => <div key={installment.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm"><div><p className="font-medium">{installment.label}</p><p className="text-xs text-muted-foreground">Échéance : {installment.dueDate || '—'}</p></div><div className="text-right"><p className="font-semibold">{formatAmount(installment.amount)} {installment.currency}</p><p className={`text-xs ${installment.isOverdue ? 'text-red-700' : 'text-muted-foreground'}`}>{installment.isOverdue ? 'En retard' : installment.status === 'PAID' ? 'Payée' : 'À payer'}</p></div></div>)}</div></div>}
            </CardContent>
          </Card>

          {/* Payment History */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CircleDollarSign className="size-5 text-blue-600" />Historique des paiements
              </CardTitle>
              <CardDescription>Tous les paiements de {selectedChild?.fullName}</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[500px]">
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead>
                          <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />Mois</span>
                        </TableHead>
                        <TableHead className="text-right">
                          <span className="flex items-center justify-end gap-1.5"><CreditCard className="size-3.5" />Montant</span>
                        </TableHead>
                        <TableHead className="text-center">Statut</TableHead>
                        <TableHead className="hidden sm:table-cell">Méthode</TableHead>
                        <TableHead className="hidden md:table-cell">Date</TableHead>
                        <TableHead className="text-right">Reçu</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(payment => (
                        <TableRow key={payment.id} className="even:bg-muted/20 hover:bg-blue-50/50 transition-colors">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {payment.status === 'overdue' && <AlertTriangle className="size-4 text-red-500 shrink-0" />}
                              {payment.month}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold">{formatAmount(payment.amount)} {payment.currency || currency}</TableCell>
                          <TableCell className="text-center">{getStatusBadge(payment.status)}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">{payment.method || '—'}</TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground text-xs">{formatDate(payment.createdAt)}</TableCell>
                          <TableCell className="text-right"><Button variant="outline" size="sm" className="min-h-10" disabled={payment.status !== 'paid' || !payment.receiptNumber || receiptBusyId === payment.id} onClick={() => void downloadReceipt(payment)}>{receiptBusyId === payment.id ? <Loader2 className="size-4 animate-spin" /> : <><Download className="mr-1.5 size-4" />PDF</>}</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="block md:hidden space-y-3 p-1">
                  {[...payments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(payment => (
                    <div key={payment.id} className="rounded-xl border border-border bg-background/80 p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm">{payment.month}</p>
                          <p className="text-xs text-muted-foreground">{payment.method || '—'}</p>
                        </div>
                        {getStatusBadge(payment.status)}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{formatAmount(payment.amount)} {payment.currency || currency}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(payment.createdAt)}</span>
                      </div>
                      {payment.status === 'paid' && payment.receiptNumber && <Button variant="outline" className="mt-3 min-h-11 w-full" disabled={receiptBusyId === payment.id} onClick={() => void downloadReceipt(payment)}>{receiptBusyId === payment.id ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Receipt className="mr-2 size-4" />}Télécharger le reçu officiel</Button>}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
