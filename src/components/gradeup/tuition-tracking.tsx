'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { BellRing, CheckCircle2, Clock3, DollarSign, FileText, Loader2, RefreshCw, Search, Wallet, XCircle } from 'lucide-react';

interface Balance {
  currency: string;
  due: number;
  paid: number;
  remaining: number;
  coverage: number;
}

interface InstallmentItem {
  id: string;
  label: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: string;
  isOverdue: boolean;
}

interface StudentTuition {
  id: string;
  fullName: string;
  matricule: string | null;
  parentId: string | null;
  classId: string | null;
  className: string;
  paymentStatus: 'paid' | 'partial' | 'unpaid' | 'overdue' | 'no-fee';
  balances: Balance[];
  fees: Array<{ feeId: string | null; name: string; amount: number; currency: string; dueDate: string }>;
  installments: InstallmentItem[];
  lastPayment: { amount: number; currency: string; createdAt: string; receiptNumber: string | null } | null;
}

interface FeeItem {
  id: string;
  classId: string | null;
  name: string;
  amount: number;
  currency: string;
  dueDate: string;
  cycle: string;
  isAnnual: boolean;
}

interface ClassOption { id: string; name: string }

const statusLabels: Record<StudentTuition['paymentStatus'], string> = {
  paid: 'Soldé', partial: 'Paiement partiel', unpaid: 'À payer', overdue: 'En retard', 'no-fee': 'Aucun frais défini',
};

function formatAmount(amount: number, currency: string) {
  return `${Number(amount || 0).toLocaleString('fr-FR')} ${currency}`;
}

export default function TuitionTracking() {
  const user = useAppStore((s) => s.user);
  const schoolId = user?.schoolId;
  const defaultCurrency = user?.school?.currency || 'USD';
  const { toast } = useToast();
  const [students, setStudents] = useState<StudentTuition[]>([]);
  const [fees, setFees] = useState<FeeItem[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [paymentStudent, setPaymentStudent] = useState<StudentTuition | null>(null);
  const [paymentInstallment, setPaymentInstallment] = useState<InstallmentItem | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentCurrency, setPaymentCurrency] = useState(defaultCurrency);
  const [paymentMonth, setPaymentMonth] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [feeDialogOpen, setFeeDialogOpen] = useState(false);
  const [feeSaving, setFeeSaving] = useState(false);
  const [feeName, setFeeName] = useState('');
  const [feeClassId, setFeeClassId] = useState('all');
  const [feeAmount, setFeeAmount] = useState('');
  const [feeCurrency, setFeeCurrency] = useState(defaultCurrency);
  const [feeDueDate, setFeeDueDate] = useState('');
  const [feeCycle, setFeeCycle] = useState('ANNUAL');
  const [planStudent, setPlanStudent] = useState<StudentTuition | null>(null);
  const [planFeeId, setPlanFeeId] = useState('');
  const [planLabel, setPlanLabel] = useState('');
  const [planAmount, setPlanAmount] = useState('');
  const [planDueDate, setPlanDueDate] = useState('');

  const fetchData = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ schoolId });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (classFilter !== 'all') params.set('classId', classFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      const res = await fetch(`/api/tuition?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Impossible de charger le suivi des frais.');
      setStudents(Array.isArray(data.students) ? data.students : []);
      setFees(Array.isArray(data.fees) ? data.fees : []);
      setClasses(Array.isArray(data.classes) ? data.classes : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de charger le suivi des frais.';
      setLoadError(message);
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [schoolId, statusFilter, classFilter, searchQuery, toast]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const openPayment = (student: StudentTuition, installment?: InstallmentItem) => {
    const balance = student.balances.find((item) => item.currency === installment?.currency) ?? student.balances.find((item) => item.remaining > 0);
    setPaymentStudent(student);
    setPaymentInstallment(installment ?? null);
    setPaymentAmount(installment ? String(installment.amount) : balance?.remaining ? String(balance.remaining) : '');
    setPaymentCurrency(installment?.currency ?? balance?.currency ?? defaultCurrency);
    setPaymentMonth(installment?.label ?? '');
    setPaymentMethod('cash');
  };

  const closePayment = () => {
    setPaymentStudent(null);
    setPaymentInstallment(null);
    setPaymentAmount('');
    setPaymentMonth('');
  };

  const submitPayment = async () => {
    if (!paymentStudent || !Number.isFinite(Number(paymentAmount)) || Number(paymentAmount) <= 0) {
      toast({ title: 'Montant invalide', description: 'Saisissez un montant supérieur à zéro.', variant: 'destructive' });
      return;
    }
    setActionLoading(paymentStudent.id);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: paymentStudent.id,
          amount: Number(paymentAmount),
          currency: paymentCurrency,
          status: 'paid',
          method: paymentMethod,
          month: paymentMonth,
          academicYear: user?.school?.academicYear || '',
          ...(paymentInstallment ? { installmentId: paymentInstallment.id } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Paiement non enregistré.');
      toast({ title: 'Paiement enregistré', description: `Reçu ${data.payment?.receiptNumber || 'créé'}.` });
      closePayment();
      await fetchData();
    } catch (error) {
      toast({ title: 'Erreur', description: error instanceof Error ? error.message : 'Paiement non enregistré.', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const remindParent = async (student: StudentTuition) => {
    setActionLoading(student.id);
    try {
      const res = await fetch('/api/tuition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remind-parent', studentId: student.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rappel non envoyé.');
      toast({ title: 'Rappel envoyé', description: `Le parent de ${student.fullName} a été notifié.` });
    } catch (error) {
      toast({ title: 'Erreur', description: error instanceof Error ? error.message : 'Rappel non envoyé.', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const createFee = async () => {
    if (!feeName.trim() || !Number.isFinite(Number(feeAmount)) || Number(feeAmount) <= 0) {
      toast({ title: 'Barème invalide', description: 'Saisissez un libellé et un montant supérieur à zéro.', variant: 'destructive' });
      return;
    }
    setFeeSaving(true);
    try {
      const res = await fetch('/api/fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: feeName.trim(), amount: Number(feeAmount), currency: feeCurrency, classId: feeClassId === 'all' ? null : feeClassId, dueDate: feeDueDate, cycle: feeCycle, isAnnual: feeCycle === 'ANNUAL' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Impossible d’enregistrer le barème.');
      toast({ title: 'Barème créé', description: feeName.trim() });
      setFeeDialogOpen(false);
      setFeeName('');
      setFeeAmount('');
      setFeeDueDate('');
      await fetchData();
    } catch (error) {
      toast({ title: 'Erreur', description: error instanceof Error ? error.message : 'Impossible d’enregistrer le barème.', variant: 'destructive' });
    } finally {
      setFeeSaving(false);
    }
  };

  const openPlanInstallment = (student: StudentTuition) => {
    const applicable = fees.find((fee) => fee.classId === student.classId || fee.classId === null);
    if (!applicable) return;
    setPlanStudent(student);
    setPlanFeeId(applicable.id);
    setPlanLabel(applicable.name);
    setPlanAmount(String(applicable.amount));
    setPlanDueDate(applicable.dueDate || '');
  };

  const createInstallment = async () => {
    if (!planStudent || !planFeeId || !planLabel.trim() || !Number.isFinite(Number(planAmount)) || Number(planAmount) <= 0 || !planDueDate) {
      toast({ title: 'Échéance invalide', description: 'Renseignez le libellé, le montant et la date d’échéance.', variant: 'destructive' });
      return;
    }
    setActionLoading(planStudent.id);
    try {
      const selectedFee = fees.find((fee) => fee.id === planFeeId);
      const res = await fetch(`/api/fees/${planFeeId}/installments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: planStudent.id, feeId: planFeeId, label: planLabel.trim(), amount: Number(planAmount), currency: selectedFee?.currency || defaultCurrency, dueDate: planDueDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Impossible de créer cette échéance.');
      toast({ title: 'Échéance planifiée', description: `${planLabel} · ${planStudent.fullName}` });
      setPlanStudent(null);
      await fetchData();
    } catch (error) {
      toast({ title: 'Erreur', description: error instanceof Error ? error.message : 'Impossible de créer cette échéance.', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const counts = useMemo(() => ({
    paid: students.filter((student) => student.paymentStatus === 'paid').length,
    unpaid: students.filter((student) => ['unpaid', 'partial'].includes(student.paymentStatus)).length,
    overdue: students.filter((student) => student.paymentStatus === 'overdue').length,
  }), [students]);

  const feeRows = useMemo(() => fees.map((fee) => ({ ...fee, className: classes.find((item) => item.id === fee.classId)?.name || (fee.classId ? 'Classe supprimée' : 'Toutes les classes') })), [fees, classes]);
  const planFeeOptions = planStudent ? fees.filter((fee) => fee.classId === planStudent.classId || fee.classId === null) : [];
  const selectedPlanFee = fees.find((fee) => fee.id === planFeeId);

  return (
    <div className="space-y-6 p-4 sm:p-6 pb-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Frais scolaires</h1>
          <p className="text-muted-foreground">Échéances, paiements, soldes par devise et rappels aux parents.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchData()} disabled={loading} className="min-h-11">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualiser
        </Button>
      </div>

      {loadError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{loadError} <Button variant="link" className="h-auto p-0" onClick={() => void fetchData()}>Réessayer</Button></div>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4"><UserRoundIcon /><div><p className="text-xs text-muted-foreground">Élèves concernés</p><strong className="text-xl">{students.length}</strong></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><p className="text-xs text-muted-foreground">Soldés</p><strong className="text-xl">{counts.paid}</strong></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Clock3 className="h-5 w-5 text-amber-600" /><div><p className="text-xs text-muted-foreground">À régler / en retard</p><strong className="text-xl">{counts.unpaid + counts.overdue}</strong></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Barème des frais</CardTitle><CardDescription className="mt-1">Montants officiels définis par classe et échéance, sans conversion entre devises.</CardDescription></div><Button className="min-h-11" onClick={() => { setFeeCurrency(defaultCurrency); setFeeDialogOpen(true); }}><DollarSign className="mr-2 h-4 w-4" /> Nouveau barème</Button></div>
        </CardHeader>
        <CardContent>
          {feeRows.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucun barème de frais n’est configuré. Les frais de classe restent affichés dans le solde des élèves.</p> : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {feeRows.map((fee) => <div key={fee.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{fee.name}</p><p className="text-xs text-muted-foreground">{fee.className} · {fee.cycle || 'Annuel'}</p></div><strong className="shrink-0">{formatAmount(fee.amount, fee.currency)}</strong></div>
                <p className="mt-2 text-xs text-muted-foreground">Échéance : {fee.dueDate || 'À définir'}{fee.isAnnual ? ' · annuel' : ''}</p>
              </div>)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-lg">Suivi des paiements</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Rechercher un élève" placeholder="Nom ou matricule" className="min-h-11 pl-8 sm:w-52" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></div>
              <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="min-h-11 sm:w-44"><SelectValue placeholder="Statut" /></SelectTrigger><SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="paid">Soldé</SelectItem><SelectItem value="partial">Paiement partiel</SelectItem><SelectItem value="unpaid">À payer</SelectItem><SelectItem value="overdue">En retard</SelectItem><SelectItem value="no-fee">Aucun frais</SelectItem>
              </SelectContent></Select>
              <Select value={classFilter} onValueChange={setClassFilter}><SelectTrigger className="min-h-11 sm:w-44"><SelectValue placeholder="Classe" /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les classes</SelectItem>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <div className="h-24 animate-pulse rounded-xl bg-muted" key={index} />)}</div> : students.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">Aucun élève ne correspond aux filtres.</div> : (
            <ScrollArea className="max-h-[680px] pr-3"><div className="space-y-3">
              {students.map((student) => {
                const statusClass = student.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' : student.paymentStatus === 'overdue' ? 'bg-red-100 text-red-800' : student.paymentStatus === 'no-fee' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800';
                const isBusy = actionLoading === student.id;
                return <article key={student.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{student.fullName}</h3><Badge className={statusClass}>{statusLabels[student.paymentStatus]}</Badge></div>
                      <p className="mt-1 text-sm text-muted-foreground">{student.className}{student.matricule ? ` · ${student.matricule}` : ''}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {student.balances.length ? student.balances.map((balance) => <span key={balance.currency} className="rounded-lg bg-muted px-2.5 py-1.5 text-xs">Payé {formatAmount(balance.paid, balance.currency)} / {formatAmount(balance.due, balance.currency)} · reste {formatAmount(balance.remaining, balance.currency)} ({balance.coverage}%)</span>) : <span className="text-sm text-muted-foreground">Aucun montant de frais disponible.</span>}
                      </div>
                      {student.lastPayment && <p className="mt-2 text-xs text-muted-foreground">Dernier reçu : {student.lastPayment.receiptNumber || '—'} · {formatAmount(student.lastPayment.amount, student.lastPayment.currency)} · {new Date(student.lastPayment.createdAt).toLocaleDateString('fr-FR')}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <Button variant="outline" className="min-h-11" onClick={() => setExpandedStudentId((current) => current === student.id ? null : student.id)}>
                        <FileText className="mr-2 h-4 w-4" /> {expandedStudentId === student.id ? 'Masquer les échéances' : `Échéances (${student.installments.length || student.fees.length})`}
                      </Button>
                      <Button className="min-h-11" onClick={() => openPayment(student)} disabled={student.paymentStatus === 'no-fee'}><DollarSign className="mr-2 h-4 w-4" /> Enregistrer un paiement</Button>
                      <Button variant="outline" className="min-h-11" onClick={() => void remindParent(student)} disabled={!student.parentId || isBusy} title={!student.parentId ? 'Aucun parent lié' : undefined}><BellRing className="mr-2 h-4 w-4" /> Rappeler le parent</Button>
                      {fees.some((fee) => fee.classId === student.classId || fee.classId === null) && <Button variant="outline" className="min-h-11" onClick={() => openPlanInstallment(student)} disabled={isBusy}><Clock3 className="mr-2 h-4 w-4" /> Planifier une tranche</Button>}
                    </div>
                  </div>

                  {expandedStudentId === student.id && <div className="mt-4 border-t pt-3">
                    {student.installments.length ? <div className="space-y-2">{student.installments.map((installment) => <div key={installment.id} className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="font-medium">{installment.label}</p><p className="text-xs text-muted-foreground">Échéance : {installment.dueDate || '—'} · {installment.status === 'PAID' ? 'Réglée' : installment.isOverdue ? 'En retard' : 'À régler'}</p></div>
                      <div className="flex items-center justify-between gap-3"><strong>{formatAmount(installment.amount, installment.currency)}</strong>{installment.status !== 'PAID' && <Button size="sm" className="min-h-10" onClick={() => openPayment(student, installment)}>Payer cette tranche</Button>}</div>
                    </div>)}</div> : student.fees.length ? <div className="space-y-2">{student.fees.map((fee, index) => <div key={`${fee.name}-${index}`} className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between"><span>{fee.name} · échéance {fee.dueDate || 'à définir'}</span><strong>{formatAmount(fee.amount, fee.currency)}</strong></div>)}</div> : <p className="text-sm text-muted-foreground">Aucune échéance définie pour cet élève.</p>}
                  </div>}
                </article>;
              })}
            </div></ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={feeDialogOpen} onOpenChange={setFeeDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Créer un barème de frais</DialogTitle><DialogDescription>Les montants sont enregistrés dans leur devise d’origine.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2"><Label htmlFor="fee-name">Libellé *</Label><Input id="fee-name" value={feeName} onChange={(event) => setFeeName(event.target.value)} placeholder="Frais scolaires annuels" /></div>
            <div className="grid gap-2"><Label htmlFor="fee-amount">Montant *</Label><Input id="fee-amount" type="number" min="0.01" step="0.01" value={feeAmount} onChange={(event) => setFeeAmount(event.target.value)} /></div>
            <div className="grid gap-2"><Label htmlFor="fee-currency">Devise</Label><Select value={feeCurrency} onValueChange={setFeeCurrency}><SelectTrigger id="fee-currency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="CDF">CDF</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent></Select></div>
            <div className="grid gap-2"><Label htmlFor="fee-class">Classe</Label><Select value={feeClassId} onValueChange={setFeeClassId}><SelectTrigger id="fee-class"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les classes</SelectItem>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label htmlFor="fee-cycle">Périodicité</Label><Select value={feeCycle} onValueChange={setFeeCycle}><SelectTrigger id="fee-cycle"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ANNUAL">Annuelle</SelectItem><SelectItem value="SEMESTER">Semestrielle</SelectItem><SelectItem value="TRIMESTER">Trimestrielle</SelectItem><SelectItem value="MONTHLY">Mensuelle</SelectItem></SelectContent></Select></div>
            <div className="grid gap-2 sm:col-span-2"><Label htmlFor="fee-due">Échéance</Label><Input id="fee-due" type="date" value={feeDueDate} onChange={(event) => setFeeDueDate(event.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFeeDialogOpen(false)} disabled={feeSaving}>Annuler</Button><Button onClick={() => void createFee()} disabled={feeSaving}>{feeSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement…</> : 'Créer le barème'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(planStudent)} onOpenChange={(open) => { if (!open) setPlanStudent(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Planifier une tranche</DialogTitle><DialogDescription>{planStudent?.fullName}{planStudent ? ` · ${planStudent.className}` : ''}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label htmlFor="plan-fee">Barème concerné *</Label><Select value={planFeeId} onValueChange={(value) => { const fee = fees.find((item) => item.id === value); setPlanFeeId(value); if (fee) { setPlanLabel(fee.name); setPlanAmount(String(fee.amount)); setPlanDueDate(fee.dueDate || ''); } }}><SelectTrigger id="plan-fee"><SelectValue placeholder="Choisir le barème" /></SelectTrigger><SelectContent>{planFeeOptions.map((fee) => <SelectItem key={fee.id} value={fee.id}>{fee.name} · {formatAmount(fee.amount, fee.currency)}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label htmlFor="plan-label">Libellé de l’échéance *</Label><Input id="plan-label" value={planLabel} onChange={(event) => setPlanLabel(event.target.value)} placeholder="Tranche 1" /></div>
            <div className="grid gap-2"><Label htmlFor="plan-amount">Montant ({selectedPlanFee?.currency || defaultCurrency}) *</Label><Input id="plan-amount" type="number" min="0.01" step="0.01" value={planAmount} onChange={(event) => setPlanAmount(event.target.value)} /></div>
            <div className="grid gap-2"><Label htmlFor="plan-due-date">Date d’échéance *</Label><Input id="plan-due-date" type="date" value={planDueDate} onChange={(event) => setPlanDueDate(event.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPlanStudent(null)} disabled={Boolean(actionLoading)}>Annuler</Button><Button onClick={() => void createInstallment()} disabled={Boolean(actionLoading) || !planFeeId}>{actionLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement…</> : 'Créer l’échéance'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(paymentStudent)} onOpenChange={(open) => { if (!open) closePayment(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Enregistrer un règlement</DialogTitle><DialogDescription>{paymentStudent?.fullName}{paymentInstallment ? ` · ${paymentInstallment.label}` : ''}. Le serveur crée le reçu officiel.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label htmlFor="tuition-amount">Montant *</Label><Input id="tuition-amount" type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} disabled={Boolean(paymentInstallment)} /></div>
            <div className="grid gap-2"><Label htmlFor="tuition-currency">Devise</Label><Select value={paymentCurrency} onValueChange={setPaymentCurrency} disabled={Boolean(paymentInstallment)}><SelectTrigger id="tuition-currency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="CDF">CDF</SelectItem><SelectItem value="EUR">EUR</SelectItem></SelectContent></Select></div>
            <div className="grid gap-2"><Label htmlFor="tuition-period">Échéance / période</Label><Input id="tuition-period" value={paymentMonth} onChange={(event) => setPaymentMonth(event.target.value)} placeholder="Ex. Tranche 1, Septembre" /></div>
            <div className="grid gap-2"><Label htmlFor="tuition-method">Mode de paiement</Label><Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger id="tuition-method"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Espèces</SelectItem><SelectItem value="mobile">Mobile Money</SelectItem><SelectItem value="virement">Virement</SelectItem><SelectItem value="cheque">Chèque</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={closePayment} disabled={Boolean(actionLoading)}>Annuler</Button><Button onClick={() => void submitPayment()} disabled={!paymentAmount || Boolean(actionLoading)}>{actionLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement…</> : <><Wallet className="mr-2 h-4 w-4" />Confirmer et créer le reçu</>}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserRoundIcon() {
  return <XCircle className="h-5 w-5 text-muted-foreground" />;
}
