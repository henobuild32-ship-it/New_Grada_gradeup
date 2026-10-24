'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, CheckCircle, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';

interface TitularClass { id: string; name: string; level: string; titularId?: string | null }
interface SchoolYear { id: string; year: string; status: string }
interface Transmission {
  id: string;
  status: string;
  notes?: string;
  sentAt?: string | null;
  evaluation: { title: string; period?: string; trimester?: string };
  course: { name: string };
  teacher: { fullName: string };
}
interface ConsolidatedStudent {
  id: string;
  fullName: string;
  postName: string;
  notesByCourse: Record<string, { average: number | null; count: number }>;
}
interface ConsolidatedData { students: ConsolidatedStudent[]; courses: Array<{ id: string; name: string }> }

export default function TitulaireCotation() {
  const user = useAppStore((state) => state.user);
  const [classes, setClasses] = useState<TitularClass[]>([]);
  const [classId, setClassId] = useState('');
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [schoolYearId, setSchoolYearId] = useState('');
  const [transmissions, setTransmissions] = useState<Transmission[]>([]);
  const [consolidated, setConsolidated] = useState<ConsolidatedData | null>(null);
  const [correctionDrafts, setCorrectionDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');

  const fetchData = useCallback(async (targetClassId = classId, targetSchoolYearId = schoolYearId) => {
    if (!targetClassId) return;
    setLoading(true);
    setError('');
    try {
      const year = targetSchoolYearId ? `&schoolYearId=${encodeURIComponent(targetSchoolYearId)}` : '';
      const [receivedResponse, assembledResponse] = await Promise.all([
        fetch(`/api/cahier/transmissions/received?classId=${encodeURIComponent(targetClassId)}${year}`, { cache: 'no-store' }),
        fetch(`/api/cahier/transmissions/assembled?classId=${encodeURIComponent(targetClassId)}${year}`, { cache: 'no-store' }),
      ]);
      const [receivedData, assembledData] = await Promise.all([receivedResponse.json(), assembledResponse.json()]);
      if (!receivedResponse.ok) throw new Error(receivedData.error || 'Impossible de charger les transmissions.');
      if (!assembledResponse.ok) throw new Error(assembledData.error || 'Impossible de consolider les notes.');
      setTransmissions(Array.isArray(receivedData.transmissions) ? receivedData.transmissions : []);
      setConsolidated({ students: assembledData.students || [], courses: assembledData.courses || [] });
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Erreur de chargement.');
    } finally { setLoading(false); }
  }, [classId, schoolYearId]);

  useEffect(() => {
    if (!user?.id || user.role !== 'TEACHER') return;
    Promise.all([fetch('/api/classes', { cache: 'no-store' }), fetch('/api/school-years', { cache: 'no-store' })])
      .then(async ([classesResponse, yearsResponse]) => {
        const [payload, yearsPayload] = await Promise.all([classesResponse.json(), yearsResponse.json()]);
        if (!classesResponse.ok) throw new Error(payload.error || 'Impossible de charger les classes.');
        const titularClasses = (payload.classes || []).filter((item: TitularClass) => item.titularId === user.id);
        setClasses(titularClasses);
        setClassId((current) => current || titularClasses[0]?.id || '');
        const years = Array.isArray(yearsPayload.years) ? yearsPayload.years : [];
        setSchoolYears(years);
        setSchoolYearId((current) => current || years.find((year: SchoolYear) => year.status === 'OPEN')?.id || years[0]?.id || '');
      })
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : 'Erreur de chargement des classes.'));
  }, [user?.id, user?.role]);

  useEffect(() => { if (classId) void fetchData(classId, schoolYearId); }, [classId, schoolYearId, fetchData]);

  const pendingCount = useMemo(() => transmissions.filter((item) => item.status === 'SENT' || item.status === 'RESENT').length, [transmissions]);
  const correctionCount = useMemo(() => transmissions.filter((item) => item.status === 'REJECTED' || item.status === 'PARTIAL').length, [transmissions]);

  const decide = async (transmissionId: string, action: 'RECEIVE' | 'REJECT') => {
    setWorkingId(transmissionId);
    try {
      const response = await fetch('/api/cahier/transmissions/receive', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transmissionId, action, notes: correctionDrafts[transmissionId] || '' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'La décision n’a pas été enregistrée.');
      toast.success(action === 'RECEIVE' ? 'Cahier validé. Le professeur a été notifié.' : 'Demande de correction envoyée au professeur.');
      await fetchData();
    } catch (decisionError) {
      toast.error(decisionError instanceof Error ? decisionError.message : 'Erreur lors de la décision.');
    } finally { setWorkingId(''); }
  };

  if (user?.role !== 'TEACHER' || classes.length === 0) return null;

  return (
    <Card className="mb-6 border-indigo-200 dark:border-indigo-900">
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-indigo-600" />Centralisation des cotations</CardTitle>
          <CardDescription>Consultez les cahiers reçus, demandez des corrections ou validez les notes de votre classe titulaire.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="min-h-10 w-56"><SelectValue placeholder="Choisir une classe titulaire" /></SelectTrigger>
            <SelectContent>{classes.map((klass) => <SelectItem key={klass.id} value={klass.id}>{klass.name}</SelectItem>)}</SelectContent>
          </Select>
          {schoolYears.length > 0 && <Select value={schoolYearId} onValueChange={setSchoolYearId}>
            <SelectTrigger className="min-h-10 w-44"><SelectValue placeholder="Année scolaire" /></SelectTrigger>
            <SelectContent>{schoolYears.map((year) => <SelectItem key={year.id} value={year.id}>{year.year}</SelectItem>)}</SelectContent>
          </Select>}
          <Button variant="outline" size="icon" onClick={() => void fetchData()} disabled={loading} aria-label="Actualiser les cotations">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <div role="alert" className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{transmissions.length} cahier(s) transmis</Badge>
          <Badge className="bg-amber-100 text-amber-800">{pendingCount} à traiter</Badge>
          <Badge variant={correctionCount ? 'destructive' : 'secondary'}>{correctionCount} à corriger</Badge>
          <Badge className="bg-emerald-100 text-emerald-800">{transmissions.filter((item) => item.status === 'RECEIVED').length} validé(s)</Badge>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Chargement des cahiers…</p>}
        {!loading && transmissions.length === 0 && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Aucun cahier transmis pour cette classe.</p>}
        {transmissions.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold">Cahiers reçus</h3>
            {transmissions.map((item) => {
              const canDecide = item.status === 'SENT' || item.status === 'RESENT';
              const badge = item.status === 'RECEIVED' ? 'Validé' : item.status === 'REJECTED' ? 'À corriger' : item.status === 'PARTIAL' ? 'Partiel' : 'En attente';
              return (
                <div key={item.id} className="rounded-lg border p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{item.evaluation?.title || 'Évaluation'} · {item.course?.name || 'Matière'}</p>
                      <p className="text-sm text-muted-foreground">{item.teacher?.fullName || 'Professeur'} · {item.sentAt ? new Date(item.sentAt).toLocaleDateString('fr-FR') : 'Date inconnue'} · {item.evaluation?.trimester || item.evaluation?.period || ''}</p>
                      {item.notes && <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-900">Retour : {item.notes}</p>}
                    </div>
                    <Badge variant={item.status === 'RECEIVED' ? 'secondary' : item.status === 'REJECTED' ? 'destructive' : 'outline'}>{badge}</Badge>
                  </div>
                  {canDecide && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                      <div className="space-y-1"><Label htmlFor={`correction-${item.id}`} className="text-xs">Note de correction (facultative pour valider)</Label><Textarea id={`correction-${item.id}`} rows={2} value={correctionDrafts[item.id] || ''} onChange={(event) => setCorrectionDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Indiquez les éléments à reprendre…" /></div>
                      <Button variant="outline" className="min-h-10" disabled={workingId === item.id || !correctionDrafts[item.id]?.trim()} onClick={() => void decide(item.id, 'REJECT')}>Demander une correction</Button>
                      <Button className="min-h-10 bg-emerald-600 hover:bg-emerald-700" disabled={workingId === item.id} onClick={() => void decide(item.id, 'RECEIVE')}><CheckCircle className="mr-2 h-4 w-4" />Valider</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {consolidated && (
          <div className="space-y-3">
            <h3 className="font-semibold">Moyennes centralisées / 20</h3>
            {consolidated.students.length === 0 ? <p className="text-sm text-muted-foreground">Aucun élève inscrit dans cette classe.</p> : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader><TableRow><TableHead>Élève</TableHead>{consolidated.courses.map((course) => <TableHead key={course.id} className="min-w-28">{course.name}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>{consolidated.students.map((student) => <TableRow key={student.id}>
                    <TableCell className="min-w-44 font-medium">{student.fullName} {student.postName}</TableCell>
                    {consolidated.courses.map((course) => {
                      const grade = student.notesByCourse[course.name];
                      return <TableCell key={course.id}>{grade?.count ? `${grade.average?.toFixed(1)} (${grade.count})` : <span className="text-muted-foreground">Manquante</span>}</TableCell>;
                    })}
                  </TableRow>)}</TableBody>
                </Table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">La vue centrale affiche les notes transmises; chaque professeur reste responsable de ses cotations. Les moyennes affichées sont normalisées sur 20.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
