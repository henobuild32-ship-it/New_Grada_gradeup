'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus,
  Search,
  DollarSign,
  MoreVertical,
  CreditCard,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Wallet,
  CircleDollarSign,
  Receipt,
  Download,
  Share2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

interface PaymentItem {
  id: string;
  studentId: string;
  amount: number;
  status: string;
  month: string;
  method: string;
  currency?: string;
  receiptNumber?: string | null;
  academicYear?: string;
  createdAt: string;
  student?: { id: string; fullName: string; classEnrollments?: Array<{ class: { id: string; name: string } }> };
}

interface StudentItem {
  id: string;
  fullName: string;
  classEnrollments?: Array<{ class: { id: string; name: string } }>;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  paid: { label: 'Payé', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle },
  pending: { label: 'En attente', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  overdue: { label: 'En retard', color: 'bg-red-100 text-red-700 border-red-200', icon: AlertTriangle },
  late: { label: 'En retard', color: 'bg-red-100 text-red-700 border-red-200', icon: AlertTriangle },
};

const months = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export default function AdminPayments() {
  const { user } = useAppStore();
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('ALL');
  const [filterMonth, setFilterMonth] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formStudentId, setFormStudentId] = useState('');
  const [formClassName, setFormClassName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formMonth, setFormMonth] = useState('');
  const [formStatus, setFormStatus] = useState('pending');
  const [formMethod, setFormMethod] = useState('cash');
  const schoolCurrency = user?.school?.currency || 'USD';
  const [formCurrency, setFormCurrency] = useState(schoolCurrency);
  const [receiptActionId, setReceiptActionId] = useState<string | null>(null);
  const [offlineReceipts, setOfflineReceipts] = useState<Array<{ url: string; fileName?: string | null; blob: Blob; size: number; downloadedAt: number; schoolId: string }>>([]);

  const loadOfflineReceipts = useCallback(async () => {
    if (!user?.schoolId) return;
    try {
      const { getLocalDB } = await import('@/lib/offline/db');
      const files = await getLocalDB().offlineFiles.where('schoolId').equals(user.schoolId).toArray();
      setOfflineReceipts(files.filter((file) => file.url.startsWith(`gradeup-receipt:${user.schoolId}:`)));
    } catch {
      setOfflineReceipts([]);
    }
  }, [user?.schoolId]);

  useEffect(() => { void loadOfflineReceipts(); }, [loadOfflineReceipts]);

  const fetchPayments = useCallback(async () => {
    try {
      let url = `/api/payments?schoolId=${user?.schoolId}`;
      if (activeTab !== 'ALL') url += `&status=${activeTab}`;
      if (filterClass !== 'ALL') url += `&classId=${filterClass}`;
      if (filterMonth !== 'ALL') url += `&month=${filterMonth}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPayments(Array.isArray(data.payments) ? data.payments : []);
    } catch {
      toast.error('Erreur lors du chargement des paiements');
    } finally {
      setLoading(false);
    }
  }, [user?.schoolId, activeTab, filterClass, filterMonth]);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await fetch(`/api/users?schoolId=${user?.schoolId}&role=STUDENT`);
      if (!res.ok) return;
      const data = await res.json();
      setStudents(Array.isArray(data.users) ? data.users : []);
    } catch {
      // silencieux
    }
  }, [user?.schoolId]);

  const fetchClasses = useCallback(async () => {
    try {
      const res = await fetch(`/api/classes?schoolId=${user?.schoolId}`);
      if (!res.ok) return;
      const data = await res.json();
      setClasses(Array.isArray(data.classes) ? data.classes : []);
    } catch {
      // silencieux
    }
  }, [user?.schoolId]);

  useEffect(() => {
    if (user?.schoolId) {
      setLoading(true);
      fetchPayments();
      fetchStudents();
      fetchClasses();
    }
  }, [fetchPayments, fetchStudents, fetchClasses, user?.schoolId]);

  const resetForm = () => {
    setFormStudentId('');
    setFormClassName('');
    setFormAmount('');
    setFormMonth('');
    setFormStatus('pending');
    setFormMethod('cash');
    setFormCurrency(schoolCurrency);
  };

  const selectStudent = (studentId: string) => {
    setFormStudentId(studentId);
    const selectedStudent = students.find((student) => student.id === studentId);
    setFormClassName(selectedStudent?.classEnrollments?.[0]?.class.name || 'Aucune classe attribuée');
  };

  const handleSubmit = async () => {
    if (!formStudentId) {
      toast.error('Veuillez sélectionner un élève');
      return;
    }
    if (!formAmount || parseFloat(formAmount) <= 0) {
      toast.error('Veuillez entrer un montant valide');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: user?.schoolId,
          studentId: formStudentId,
          amount: parseFloat(formAmount),
          month: formMonth,
          status: formStatus,
          method: formMethod,
          currency: formCurrency,
          academicYear: user?.school?.academicYear || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success('Paiement enregistré avec succès');
      setDialogOpen(false);
      resetForm();
      fetchPayments();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'opération');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceipt = async (payment: PaymentItem, mode: 'download' | 'share') => {
    if (payment.status !== 'paid') {
      toast.error('Le reçu officiel est disponible après confirmation du paiement.');
      return;
    }
    if (!payment.receiptNumber) {
      toast.error('Ce paiement ne possède pas de numéro de reçu attribué par le serveur.');
      return;
    }
    if (!user?.schoolId) return;
    setReceiptActionId(payment.id);
    try {
      const { getLocalDB } = await import('@/lib/offline/db');
      const db = getLocalDB();
      const cacheUrl = `gradeup-receipt:${user.schoolId}:${payment.id}`;
      let blob = (await db.offlineFiles.get(cacheUrl))?.blob;
      let fileName = `recu-${payment.receiptNumber}.pdf`;
      if (!blob) {
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
        const currency = payment.currency || schoolCurrency;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(18);
        pdf.text(user.school?.name || 'Établissement scolaire', 20, 22);
        pdf.setFontSize(15);
        pdf.text('REÇU OFFICIEL DE PAIEMENT', 20, 42);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(11);
        pdf.text(`N° ${payment.receiptNumber}`, 20, 52);
        pdf.text(`Élève : ${payment.student?.fullName || '—'}`, 20, 66);
        pdf.text(`Classe : ${payment.student?.classEnrollments?.[0]?.class.name || '—'}`, 20, 74);
        pdf.text(`Motif / période : ${payment.month || 'Frais scolaires'}`, 20, 82);
        pdf.text(`Montant reçu : ${Number(payment.amount).toLocaleString('fr-FR')} ${currency}`, 20, 96);
        pdf.text(`Mode de paiement : ${payment.method || '—'}`, 20, 104);
        pdf.text(`Date : ${payment.createdAt ? new Date(payment.createdAt).toLocaleDateString('fr-FR') : '—'}`, 20, 112);
        pdf.text(`Année scolaire : ${payment.academicYear || user.school?.academicYear || '—'}`, 20, 120);
        pdf.setDrawColor(180);
        pdf.line(20, 142, 190, 142);
        pdf.setFontSize(10);
        pdf.text('Document généré par GradeUp. Conservez ce reçu pour vos dossiers.', 20, 151);
        blob = pdf.output('blob');
        await db.offlineFiles.put({ url: cacheUrl, fileName, blob, size: blob.size, downloadedAt: Date.now(), schoolId: user.schoolId });
        await loadOfflineReceipts();
      }

      if (mode === 'share' && typeof navigator !== 'undefined' && navigator.share) {
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ title: `Reçu ${payment.receiptNumber}`, files: [file] });
          return;
        }
      }
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.success(mode === 'share' ? 'Le partage de fichier n’est pas disponible ici; le reçu a été téléchargé.' : 'Reçu téléchargé et conservé hors ligne.');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      toast.error(error instanceof Error ? error.message : 'Impossible de générer le reçu.');
    } finally {
      setReceiptActionId(null);
    }
  };

  const downloadCachedReceipt = async (file: (typeof offlineReceipts)[number]) => {
    const objectUrl = URL.createObjectURL(file.blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = file.fileName || 'recu-gradeup.pdf';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const handleUpdateStatus = async (paymentId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/payments/${paymentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: user?.schoolId,
          status: newStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success('Statut mis à jour avec succès');
      fetchPayments();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la mise à jour');
    }
  };

  const filteredPayments = payments.filter((p) => {
    const matchesSearch =
      !searchQuery ||
      p.student?.fullName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const totalsByCurrency = (rows: PaymentItem[]) => {
    const totals = new Map<string, number>();
    rows.forEach((payment) => {
      const currency = payment.currency || schoolCurrency;
      totals.set(currency, (totals.get(currency) || 0) + Number(payment.amount || 0));
    });
    return totals.size ? [...totals.entries()].map(([currency, amount]) => `${amount.toLocaleString('fr-FR')} ${currency}`).join(' · ') : `0 ${schoolCurrency}`;
  };
  const totalPaid = totalsByCurrency(payments.filter((payment) => payment.status === 'paid'));
  const totalPending = totalsByCurrency(payments.filter((payment) => payment.status === 'pending'));
  const totalOverdue = totalsByCurrency(payments.filter((payment) => ['late', 'overdue'].includes(payment.status)));
  const totalAll = totalsByCurrency(payments.filter((payment) => payment.status !== 'cancelled'));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="mb-6 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Gestion des paiements</h1>
            <p className="text-sm text-muted-foreground mt-1">Suivez et gérez les paiements des élèves</p>
          </div>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-lg shadow-blue-500/20">
            <Plus className="h-4 w-4 mr-2" />
            Nouveau paiement
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-100">
              <Wallet className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total</p>
              <p className="text-sm font-bold text-blue-600">{totalAll}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-100">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Payé</p>
              <p className="text-sm font-bold text-emerald-600">{totalPaid}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-100">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">En attente</p>
              <p className="text-sm font-bold text-amber-600">{totalPending}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-gradient-to-br from-red-50 to-white">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">En retard</p>
              <p className="text-sm font-bold text-red-600">{totalOverdue}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="ALL">Tous</TabsTrigger>
            <TabsTrigger value="paid">
              <CheckCircle className="h-3.5 w-3.5 mr-1 text-emerald-500" />
              Payé
            </TabsTrigger>
            <TabsTrigger value="pending">
              <Clock className="h-3.5 w-3.5 mr-1 text-amber-500" />
              En attente
            </TabsTrigger>
            <TabsTrigger value="overdue">
              <AlertTriangle className="h-3.5 w-3.5 mr-1 text-red-500" />
              En retard
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger className="w-[160px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                <SelectValue placeholder="Toutes les classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes les classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-[160px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                <SelectValue placeholder="Tous les mois" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les mois</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Tabs>

      {/* Payments Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un élève..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <CreditCard className="h-10 w-10 text-muted-foreground/60" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Aucun paiement trouvé</h3>
              <p className="text-muted-foreground">Enregistrez le premier paiement pour commencer</p>
            </div>
          ) : (
            <>
            <div className="hidden md:block">
            <ScrollArea className="max-h-[500px]">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead>Élève</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Mois</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Méthode</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&>tr:nth-child(even)]:bg-muted/30">
                  {filteredPayments.map((p) => {
                    const status = statusConfig[p.status] || statusConfig.pending;
                    const StatusIcon = status.icon;
                    return (
                      <TableRow key={p.id} className="hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors">
                        <TableCell className="font-medium">
                          <div>{p.student?.fullName || 'Inconnu'}</div>
                          {p.student?.classEnrollments?.[0]?.class.name && (
                            <div className="text-xs font-normal text-muted-foreground">
                              {p.student.classEnrollments[0].class.name}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-bold">
                          {Number(p.amount).toLocaleString('fr-FR')} <span className="text-muted-foreground font-normal">{p.currency || schoolCurrency}</span>
                        </TableCell>
                        <TableCell>{p.month || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={status.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground">{p.method || '—'}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {p.createdAt ? new Date(p.createdAt).toLocaleDateString('fr-FR') : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-blue-50 transition-colors">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleUpdateStatus(p.id, 'paid')}>
                                <CheckCircle className="h-4 w-4 mr-2 text-emerald-600" />
                                Marquer payé
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleUpdateStatus(p.id, 'pending')}>
                                <Clock className="h-4 w-4 mr-2 text-amber-600" />
                                Marquer en attente
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleUpdateStatus(p.id, 'late')}>
                                <AlertTriangle className="h-4 w-4 mr-2 text-red-600" />
                                Marquer en retard
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled={p.status !== 'paid' || receiptActionId === p.id} onClick={() => void handleReceipt(p, 'download')}>
                                {receiptActionId === p.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
                                Télécharger le reçu
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled={p.status !== 'paid' || receiptActionId === p.id} onClick={() => void handleReceipt(p, 'share')}>
                                <Share2 className="mr-2 h-4 w-4" /> Partager le reçu
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
            </div>

            {/* Vue mobile : une carte par paiement (cibles tactiles ≥ 44 px) */}
            <div className="md:hidden space-y-3">
              {filteredPayments.map((p) => {
                const status = statusConfig[p.status] || statusConfig.pending;
                const StatusIcon = status.icon;
                return (
                  <div key={p.id} className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p.student?.fullName || 'Inconnu'}</p>
                        {p.student?.classEnrollments?.[0]?.class.name && (
                          <p className="text-xs text-muted-foreground truncate">
                            {p.student.classEnrollments[0].class.name}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className={`shrink-0 ${status.color}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {status.label}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold">
                        {Number(p.amount).toLocaleString('fr-FR')} <span className="text-muted-foreground font-normal text-sm">{p.currency || schoolCurrency}</span>
                        {p.month && <span className="ml-2 text-sm font-normal text-muted-foreground">· {p.month}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString('fr-FR') : '—'}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs capitalize text-muted-foreground">{p.method || '—'}</p>
                      <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="min-h-11" disabled={p.status !== 'paid' || receiptActionId === p.id} onClick={() => void handleReceipt(p, 'share')} aria-label="Partager ou télécharger le reçu">
                        {receiptActionId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="min-h-[44px] px-3 gap-1.5">
                            <MoreVertical className="h-4 w-4" />
                            Actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleUpdateStatus(p.id, 'paid')}>
                            <CheckCircle className="h-4 w-4 mr-2 text-emerald-600" />
                            Marquer payé
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleUpdateStatus(p.id, 'pending')}>
                            <Clock className="h-4 w-4 mr-2 text-amber-600" />
                            Marquer en attente
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleUpdateStatus(p.id, 'late')}>
                            <AlertTriangle className="h-4 w-4 mr-2 text-red-600" />
                            Marquer en retard
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-t-lg -mx-6 -mt-6 mb-0" />
          <DialogHeader className="pt-2">
            <DialogTitle className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-blue-600" />
              Nouveau paiement
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pay-student">Élève *</Label>
              <Select value={formStudentId} onValueChange={selectStudent}>
                <SelectTrigger id="pay-student" className="focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                  <SelectValue placeholder="Sélectionner un élève" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-class">Classe</Label>
              <Input
                id="pay-class"
                value={formClassName}
                placeholder="Sélectionnez un élève"
                readOnly
                className="bg-muted text-muted-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Montant *</Label>
              <Input
                id="pay-amount"
                type="number"
                min="0"
                step="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
                className="focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-currency">Devise</Label>
              <Select value={formCurrency} onValueChange={setFormCurrency}>
                <SelectTrigger id="pay-currency"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="USD">USD — Dollar américain</SelectItem><SelectItem value="CDF">CDF — Franc congolais</SelectItem><SelectItem value="EUR">EUR — Euro</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-month">Mois</Label>
              <Select value={formMonth} onValueChange={setFormMonth}>
                <SelectTrigger id="pay-month" className="focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                  <SelectValue placeholder="Sélectionner un mois" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pay-status">Statut</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger id="pay-status" className="focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">En attente</SelectItem>
                    <SelectItem value="paid">Payé</SelectItem>
                    <SelectItem value="late">En retard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-method">Méthode</Label>
                <Select value={formMethod} onValueChange={setFormMethod}>
                  <SelectTrigger id="pay-method" className="focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="virement">Virement</SelectItem>
                    <SelectItem value="mobile">Mobile Money</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="hover:scale-[1.02] active:scale-[0.98] transition-all">
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 hover:scale-[1.02] active:scale-[0.98] transition-transform"
            >
              {submitting ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {offlineReceipts.length > 0 && <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Receipt className="h-4 w-4" /> Reçus enregistrés hors ligne</CardTitle></CardHeader>
        <CardContent className="space-y-2">{offlineReceipts.map((file) => <div key={file.url} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="font-medium">{file.fileName || 'Reçu GradeUp'}</p><p className="text-xs text-muted-foreground">Enregistré le {new Date(file.downloadedAt).toLocaleDateString('fr-FR')} · {(file.size / 1024).toFixed(0)} Ko</p></div><Button variant="outline" className="min-h-11" onClick={() => void downloadCachedReceipt(file)}><Download className="mr-2 h-4 w-4" /> Télécharger</Button></div>)}</CardContent>
      </Card>}
    </div>
  );
}
