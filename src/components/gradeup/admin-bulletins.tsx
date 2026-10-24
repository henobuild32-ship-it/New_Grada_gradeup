'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Check, FileText, Loader2, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';

type BulletinStatus = 'DRAFT' | 'PENDING_TITULAIRE' | 'VALIDATED_TITULAIRE' | 'PENDING_ADMIN' | 'VALIDATED_ADMIN' | 'PUBLISHED';
interface AdminBulletin {
  id: string;
  studentId: string;
  term: number;
  academicYear: string;
  average: number;
  rank: number | null;
  mention: string;
  appreciation: string;
  status: BulletinStatus;
  publishedAt?: string | null;
  student: { id: string; fullName: string; gender: string; matricule?: string | null };
  class: { id: string; name: string; level?: string | null };
}
interface ClassOption { id: string; name: string; level?: string }
interface YearOption { year: string; status: string }

const labels: Record<BulletinStatus, string> = {
  DRAFT: 'Brouillon', PENDING_TITULAIRE: 'À valider par le titulaire', VALIDATED_TITULAIRE: 'Validé par le titulaire',
  PENDING_ADMIN: 'À valider par l’administration', VALIDATED_ADMIN: 'Validé par l’administration', PUBLISHED: 'Publié',
};

export default function AdminBulletins() {
  const user = useAppStore((state) => state.user);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [years, setYears] = useState<YearOption[]>([]);
  const [bulletins, setBulletins] = useState<AdminBulletin[]>([]);
  const [classId, setClassId] = useState('all');
  const [status, setStatus] = useState('all');
  const [term, setTerm] = useState('1');
  const [academicYear, setAcademicYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [appreciationBulletin, setAppreciationBulletin] = useState<AdminBulletin | null>(null);
  const [appreciation, setAppreciation] = useState('');

  const loadSetup = useCallback(async () => {
    if (!user?.schoolId) return;
    try {
      const [classRes, yearRes] = await Promise.all([
        fetch(`/api/classes?schoolId=${user.schoolId}`),
        fetch(`/api/school-years?schoolId=${user.schoolId}`),
      ]);
      const [classData, yearData] = await Promise.all([classRes.json(), yearRes.json()]);
      if (!classRes.ok) throw new Error(classData.error || 'Chargement des classes impossible.');
      if (!yearRes.ok) throw new Error(yearData.error || 'Chargement des années impossible.');
      setClasses(Array.isArray(classData.classes) ? classData.classes : []);
      const yearRows: YearOption[] = Array.isArray(yearData.years) ? yearData.years : [];
      setYears(yearRows);
      const current = yearRows.find((item) => item.status === 'OPEN')?.year || yearRows[0]?.year || '';
      setAcademicYear((value) => value || current);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Chargement des filtres impossible.');
    }
  }, [user?.schoolId]);

  const loadBulletins = useCallback(async () => {
    if (!user?.schoolId) return;
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ schoolId: user.schoolId, term, academicYear });
      if (classId !== 'all') params.set('classId', classId);
      if (status !== 'all') params.set('status', status);
      const res = await fetch(`/api/bulletins?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chargement des bulletins impossible.');
      setBulletins(Array.isArray(data.bulletins) ? data.bulletins : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Chargement des bulletins impossible.');
    } finally {
      setLoading(false);
    }
  }, [user?.schoolId, classId, status, term, academicYear]);

  useEffect(() => { void loadSetup(); }, [loadSetup]);
  useEffect(() => { void loadBulletins(); }, [loadBulletins]);

  const generate = async () => {
    if (classId === 'all' || !academicYear) {
      toast.error('Sélectionnez une classe et une année scolaire.');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/bulletins/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, term: Number(term), academicYear }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Génération impossible.');
      toast.success(`${data.generated?.length || 0} brouillon(s) calculé(s) depuis les notes enregistrées.`);
      await loadBulletins();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Génération impossible.');
    } finally {
      setGenerating(false);
    }
  };

  const transition = async (bulletin: AdminBulletin, action: 'validate-titulaire' | 'validate-admin' | 'publish', note = '') => {
    setWorkingId(bulletin.id);
    try {
      const res = await fetch(`/api/bulletins/${bulletin.id}/${action}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(note ? { appreciation: note } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transition impossible.');
      toast.success(action === 'publish' ? 'Bulletin publié et notifications envoyées.' : 'Validation enregistrée.');
      setAppreciationBulletin(null);
      setAppreciation('');
      await loadBulletins();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Transition impossible.');
    } finally {
      setWorkingId(null);
    }
  };

  const availableYears = years.length ? years : (academicYear ? [{ year: academicYear, status: 'OPEN' }] : []);

  return <div className="space-y-5 pb-24">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-bold">Bulletins à valider</h1><p className="text-sm text-muted-foreground">Calcul serveur, validation titulaire, validation administrative et publication contrôlée.</p></div>
      <Button variant="outline" className="min-h-11" onClick={() => void loadBulletins()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualiser</Button>
    </div>

    {loadError && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{loadError}</div>}

    <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <Select value={classId} onValueChange={setClassId}><SelectTrigger className="min-h-11"><SelectValue placeholder="Classe" /></SelectTrigger><SelectContent><SelectItem value="all">Choisir une classe</SelectItem>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
      <Select value={term} onValueChange={setTerm}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{[1,2,3,4].map((value) => <SelectItem key={value} value={String(value)}>Période {value}</SelectItem>)}</SelectContent></Select>
      <Select value={academicYear} onValueChange={setAcademicYear}><SelectTrigger className="min-h-11"><SelectValue placeholder="Année scolaire" /></SelectTrigger><SelectContent>{availableYears.map((item) => <SelectItem key={item.year} value={item.year}>{item.year}{item.status === 'OPEN' ? ' · ouverte' : ''}</SelectItem>)}</SelectContent></Select>
      <Select value={status} onValueChange={setStatus}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les statuts</SelectItem>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      <Button className="min-h-11" onClick={() => void generate()} disabled={generating || classId === 'all' || !academicYear}>{generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Calcul…</> : <><FileText className="mr-2 h-4 w-4" />Générer les brouillons</>}</Button>
    </CardContent></Card>

    <Card><CardHeader className="pb-3"><CardTitle className="text-base">Période {term} · {academicYear || 'Année scolaire'}</CardTitle><CardDescription>{bulletins.length} bulletin(s) correspondant aux filtres.</CardDescription></CardHeader><CardContent>
      {loading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div> : bulletins.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Aucun bulletin trouvé. La génération demande des notes enregistrées pour chaque élève de la classe.</div> : <div className="space-y-3">
        {bulletins.map((bulletin) => <article key={bulletin.id} className="flex flex-col gap-3 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{bulletin.student.fullName}</h3><Badge variant="outline">{labels[bulletin.status]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{bulletin.class.name} · {bulletin.student.matricule || 'Sans matricule'} · {bulletin.student.gender || '—'}</p><p className="mt-1 text-sm">Moyenne {bulletin.average.toFixed(2)}/20 · rang {bulletin.rank ?? '—'} · {bulletin.mention || '—'}</p></div>
          <div className="flex flex-wrap gap-2">
            {bulletin.status === 'DRAFT' && <Button variant="outline" className="min-h-11" disabled={workingId === bulletin.id} onClick={() => void transition(bulletin, 'validate-titulaire')}><Check className="mr-2 h-4 w-4" />Valider titulaire</Button>}
            {bulletin.status === 'VALIDATED_TITULAIRE' && <Button variant="outline" className="min-h-11" disabled={workingId === bulletin.id} onClick={() => { setAppreciationBulletin(bulletin); setAppreciation(bulletin.appreciation || ''); }}><Check className="mr-2 h-4 w-4" />Valider administration</Button>}
            {bulletin.status === 'VALIDATED_ADMIN' && <Button className="min-h-11" disabled={workingId === bulletin.id} onClick={() => void transition(bulletin, 'publish')}><Send className="mr-2 h-4 w-4" />Publier</Button>}
            <Button variant="outline" className="min-h-11" asChild><a href={`/api/bulletins/${bulletin.id}/pdf`}><FileText className="mr-2 h-4 w-4" />PDF</a></Button>
          </div>
        </article>)}
      </div>}
    </CardContent></Card>

    <Dialog open={Boolean(appreciationBulletin)} onOpenChange={(open) => { if (!open) { setAppreciationBulletin(null); setAppreciation(''); } }}>
      <DialogContent><DialogHeader><DialogTitle>Valider le bulletin</DialogTitle><DialogDescription>{appreciationBulletin?.student.fullName} · période {appreciationBulletin?.term}</DialogDescription></DialogHeader><div className="grid gap-2"><label htmlFor="bulletin-appreciation" className="text-sm font-medium">Appréciation générale</label><Textarea id="bulletin-appreciation" value={appreciation} onChange={(event) => setAppreciation(event.target.value)} maxLength={2000} rows={4} /></div><DialogFooter><Button variant="outline" onClick={() => setAppreciationBulletin(null)} disabled={Boolean(workingId)}>Annuler</Button><Button onClick={() => appreciationBulletin && void transition(appreciationBulletin, 'validate-admin', appreciation)} disabled={Boolean(workingId)}>{workingId ? 'Validation…' : 'Valider comme admin'}</Button></DialogFooter></DialogContent>
    </Dialog>
  </div>;
}
