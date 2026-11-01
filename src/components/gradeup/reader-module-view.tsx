'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Mode = 'overview' | 'users' | 'classes' | 'payments' | 'tuition' | 'courses' | 'attendance' | 'cards' | 'announcements' | 'bulletins' | 'schedules' | 'calendar' | 'coefficients' | 'cotation' | 'conferences' | 'passages' | 'end-of-year';
type Row = Record<string, unknown>;

const moduleCopy: Record<Mode, { title: string; description: string; endpoint: (schoolId: string) => string; key: string }> = {
  overview: { title: 'Activité de l’établissement', description: 'Indicateurs scolaires du jour, en lecture seule.', endpoint: () => '/api/stats', key: 'stats' },
  users: { title: 'Utilisateurs actifs', description: 'Comptes actifs de votre école.', endpoint: (id) => `/api/users?schoolId=${encodeURIComponent(id)}`, key: 'users' },
  classes: { title: 'Classes et structure', description: 'Classes, niveaux, sections et options configurés dans votre école.', endpoint: (id) => `/api/classes?schoolId=${encodeURIComponent(id)}`, key: 'classes' },
  payments: { title: 'Paiements · lecture seule', description: 'Opérations financières de votre école.', endpoint: (id) => `/api/payments?schoolId=${encodeURIComponent(id)}`, key: 'payments' },
  tuition: { title: 'Frais et soldes', description: 'Soldes et retards par élève.', endpoint: () => '/api/tuition', key: 'students' },
  courses: { title: 'Cours attribués', description: 'Cours, classes et professeurs de votre école.', endpoint: (id) => `/api/courses?schoolId=${encodeURIComponent(id)}`, key: 'courses' },
  attendance: { title: 'Présences', description: 'Présences enregistrées dans votre école.', endpoint: (id) => `/api/attendance?schoolId=${encodeURIComponent(id)}`, key: 'attendance' },
  cards: { title: 'Cartes élèves', description: 'Identifiants et état des cartes. L’impression reste réservée à l’administration.', endpoint: (id) => `/api/users?schoolId=${encodeURIComponent(id)}&role=STUDENT`, key: 'users' },
  announcements: { title: 'Communiqués', description: 'Messages et informations adressés au Lecteur ou à toute l’école.', endpoint: () => '/api/notifications', key: 'notifications' },
  bulletins: { title: 'Bulletins et rapports', description: 'Bulletins de votre établissement, sans action de validation ni de publication.', endpoint: () => '/api/bulletins', key: 'bulletins' },
  schedules: { title: 'Emplois du temps', description: 'Horaires et cours de toutes les classes de votre établissement.', endpoint: () => '/api/schedules', key: 'schedules' },
  calendar: { title: 'Calendrier scolaire', description: 'Périodes et dates scolaires configurées.', endpoint: () => '/api/calendar', key: 'calendar' },
  coefficients: { title: 'Coefficients', description: 'Coefficients actifs par classe et matière.', endpoint: () => '/api/coefficients', key: 'coefficients' },
  cotation: { title: 'Cotation et délibération', description: 'Règles de cotation et seuils de délibération de l’école.', endpoint: () => '/api/subject-rules', key: 'rules' },
  conferences: { title: 'Réunions', description: 'Visioconférences planifiées pour votre établissement.', endpoint: (id) => `/api/conferences?schoolId=${encodeURIComponent(id)}`, key: 'conferences' },
  passages: { title: 'Passages et promotions', description: 'Historique des décisions de passage par élève.', endpoint: () => '/api/passages', key: 'passages' },
  'end-of-year': { title: 'Fin du cursus', description: 'Synthèse scolaire de fin d’année, en consultation.', endpoint: () => '/api/end-of-year', key: 'classes' },
};

function display(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return value.toLocaleString('fr-FR');
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\d/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('fr-FR', { dateStyle: 'medium' });
  }
  return String(value);
}

function columnsFor(mode: Mode): Array<{ label: string; value: (row: Row) => unknown }> {
  switch (mode) {
    case 'users': return [
      { label: 'Nom', value: (row) => row.fullName }, { label: 'Rôle', value: (row) => row.role },
      { label: 'Classe', value: (row) => (row.classEnrollments as Array<{ class?: { name?: string } }> | undefined)?.[0]?.class?.name },
      { label: 'Dernière activité', value: (row) => row.lastActivityAt },
    ];
    case 'overview': return [
      { label: 'Indicateur', value: (row) => row.label }, { label: 'Valeur', value: (row) => row.value },
    ];
    case 'classes': return [
      { label: 'Classe', value: (row) => row.name }, { label: 'Niveau', value: (row) => row.level },
      { label: 'Cycle', value: (row) => row.cycle }, { label: 'Section', value: (row) => row.section }, { label: 'Option', value: (row) => row.option },
    ];
    case 'cards': return [
      { label: 'Élève', value: (row) => row.fullName }, { label: 'Classe', value: (row) => (row.classEnrollments as Array<{ class?: { name?: string } }> | undefined)?.[0]?.class?.name },
      { label: 'Matricule', value: (row) => row.matricule }, { label: 'Code carte', value: (row) => row.cardId },
      { label: 'Émise le', value: (row) => row.cardIssuedDate },
    ];
    case 'payments': return [
      { label: 'Élève', value: (row) => (row.student as Row | undefined)?.fullName }, { label: 'Reçu', value: (row) => row.receiptNumber },
      { label: 'Montant', value: (row) => `${display(row.amount)} ${display(row.currency)}` }, { label: 'Statut', value: (row) => row.status }, { label: 'Date', value: (row) => row.createdAt },
    ];
    case 'tuition': return [
      { label: 'Élève', value: (row) => row.fullName }, { label: 'Classe', value: (row) => row.className }, { label: 'Situation', value: (row) => row.paymentStatus },
      { label: 'Soldes', value: (row) => (row.balances as Array<{ currency: string; remaining: number }> | undefined)?.map((balance) => `${balance.remaining.toLocaleString('fr-FR')} ${balance.currency}`).join(' · ') },
    ];
    case 'courses': return [
      { label: 'Cours', value: (row) => row.name }, { label: 'Classe', value: (row) => (row.class as Row | undefined)?.name },
      { label: 'Professeur', value: (row) => (row.teacher as Row | undefined)?.fullName }, { label: 'Coefficient', value: (row) => row.coefficient },
    ];
    case 'attendance': return [
      { label: 'Élève', value: (row) => (row.student as Row | undefined)?.fullName }, { label: 'Date', value: (row) => row.date },
      { label: 'Statut', value: (row) => row.status }, { label: 'Motif', value: (row) => row.reason },
    ];
    case 'announcements': return [
      { label: 'Titre', value: (row) => row.title }, { label: 'Message', value: (row) => row.message },
      { label: 'Type', value: (row) => row.type }, { label: 'Date', value: (row) => row.createdAt },
    ];
    case 'bulletins': return [
      { label: 'Élève', value: (row) => (row.student as Row | undefined)?.fullName }, { label: 'Classe', value: (row) => (row.class as Row | undefined)?.name },
      { label: 'Année', value: (row) => row.academicYear }, { label: 'Période', value: (row) => row.term }, { label: 'Moyenne', value: (row) => row.average }, { label: 'Statut', value: (row) => row.status },
    ];
    case 'schedules': return [
      { label: 'Jour', value: (row) => row.dayOfWeek }, { label: 'Heure', value: (row) => `${display(row.startTime)} – ${display(row.endTime)}` },
      { label: 'Cours', value: (row) => (row.course as Row | undefined)?.name }, { label: 'Classe', value: (row) => ((row.course as Row | undefined)?.class as Row | undefined)?.name },
      { label: 'Professeur', value: (row) => ((row.course as Row | undefined)?.teacher as Row | undefined)?.fullName }, { label: 'Salle', value: (row) => row.room },
    ];
    case 'calendar': return [
      { label: 'Année scolaire', value: (row) => row.schoolYearId }, { label: 'Cycle', value: (row) => row.cycle }, { label: 'Mois', value: (row) => row.month },
      { label: 'Période', value: (row) => row.period }, { label: 'Début', value: (row) => row.dateStart }, { label: 'Fin', value: (row) => row.dateEnd },
    ];
    case 'coefficients': return [
      { label: 'Classe', value: (row) => (row.class as Row | undefined)?.name }, { label: 'Matière', value: (row) => (row.course as Row | undefined)?.name },
      { label: 'Section', value: (row) => row.section }, { label: 'Coefficient', value: (row) => row.coefficient },
    ];
    case 'cotation': return [
      { label: 'Type', value: (row) => row.ruleType }, { label: 'Classe / cycle', value: (row) => (row.class as Row | undefined)?.name || row.cycle },
      { label: 'Matière', value: (row) => (row.course as Row | undefined)?.name }, { label: 'Maximum / seuil', value: (row) => row.maximumPoints ?? row.passPercentage },
      { label: 'Travaux / rattrapage', value: (row) => row.dailyWorkMaximum ?? row.retakeMinPercentage }, { label: 'Examen / échecs max.', value: (row) => row.examMaximum ?? row.maxFailedCourses },
      { label: 'Élimination', value: (row) => row.eliminationPercentage },
    ];
    case 'conferences': return [
      { label: 'Réunion', value: (row) => row.title }, { label: 'Date', value: (row) => row.date }, { label: 'Heure', value: (row) => row.time }, { label: 'Public', value: (row) => row.targetRole },
    ];
    case 'passages': return [
      { label: 'Élève', value: (row) => (row.student as Row | undefined)?.fullName }, { label: 'Classe précédente', value: (row) => (row.sourceClass as Row | undefined)?.name },
      { label: 'Classe suivante', value: (row) => (row.targetClass as Row | undefined)?.name }, { label: 'Résultat', value: (row) => row.result }, { label: 'Année', value: (row) => row.targetYear },
    ];
    case 'end-of-year': return [
      { label: 'Classe', value: (row) => row.className }, { label: 'Élèves', value: (row) => row.totalStudents },
      { label: 'Passages', value: (row) => row.passages }, { label: 'Redoublements', value: (row) => row.redoublements },
      { label: 'En attente', value: (row) => row.enAttente }, { label: 'Sans notes', value: (row) => row.sansNotes },
    ];
  }
}

export default function ReaderModuleView({ mode }: { mode: Mode }) {
  const user = useAppStore((state) => state.user);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const copy = moduleCopy[mode];
  const columns = useMemo(() => columnsFor(mode), [mode]);

  const load = async () => {
    if (!user?.schoolId) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(copy.endpoint(user.schoolId), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Chargement impossible.');
      let items = data[copy.key];
      if (mode === 'cotation') {
        const gradingResponse = await fetch('/api/grading-rules', { cache: 'no-store' });
        const gradingData = await gradingResponse.json();
        if (!gradingResponse.ok) throw new Error(gradingData.error || 'Chargement des critères de délibération impossible.');
        items = [
          ...(Array.isArray(items) ? items.map((row) => ({ ...row, ruleType: 'Cotation' })) : []),
          ...(Array.isArray(gradingData.rules) ? gradingData.rules.map((row: Row) => ({ ...row, ruleType: 'Délibération' })) : []),
        ];
      }
      if (mode === 'overview' && items && typeof items === 'object') {
        const stats = items as Row;
        const summary = Object.entries(stats).flatMap(([label, value]) => value && typeof value === 'object'
          ? Object.entries(value as Row).map(([subLabel, subValue]) => ({ id: `${label}-${subLabel}`, label: `${label} · ${subLabel}`, value: subValue }))
          : [{ id: label, label, value }]);
        setRows(summary);
      } else if (Array.isArray(items)) {
        setRows(items);
      } else if (mode === 'schedules' && Array.isArray(data)) {
        setRows(data);
      } else {
        setRows([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chargement impossible.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [user?.schoolId, mode]);

  return <div className="mx-auto max-w-7xl space-y-5 pb-20">
    <div className="rounded-2xl bg-gradient-to-r from-sky-700 to-blue-600 p-5 text-white shadow-md sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div><p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"><Eye className="size-3.5" /> Lecture seule</p><h1 className="text-2xl font-bold">{copy.title}</h1><p className="mt-1 text-sm text-blue-100">{copy.description}</p></div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading} className="min-h-11 shrink-0"><RefreshCw className={`mr-2 size-4 ${loading ? 'animate-spin' : ''}`} />Actualiser</Button>
      </div>
    </div>
    <Card className="overflow-hidden rounded-2xl">
      <CardHeader><CardTitle className="text-base">{rows.length.toLocaleString('fr-FR')} élément(s)</CardTitle><CardDescription>Les informations affichées sont limitées à l’établissement de votre session.</CardDescription></CardHeader>
      <CardContent className="p-0">
        {loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
          : error ? <p role="alert" className="p-6 text-sm text-destructive">{error}</p>
          : rows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Aucune donnée à afficher.</p>
          : <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full text-sm"><thead><tr className="border-y bg-muted/40">{columns.map((column) => <th key={column.label} className="px-4 py-3 text-left font-semibold">{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id || index)} className="border-b last:border-0">{columns.map((column) => <td key={column.label} className="max-w-[320px] px-4 py-3 align-top">{display(column.value(row))}</td>)}</tr>)}</tbody></table></div>
            <div className="divide-y md:hidden">{rows.map((row, index) => <div key={String(row.id || index)} className="space-y-2 p-4"><p className="font-semibold">{display(columns[0]?.value(row))}</p>{columns.slice(1).map((column) => <div key={column.label} className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{column.label}</span><span className="text-right">{display(column.value(row))}</span></div>)}</div>)}</div>
          </>}
      </CardContent>
    </Card>
  </div>;
}
