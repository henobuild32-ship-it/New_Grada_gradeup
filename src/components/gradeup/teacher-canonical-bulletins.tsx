'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { AlertCircle, BookOpenCheck, Check, RefreshCw, Send } from 'lucide-react';

type TitularClass = { id: string; name: string; titulaireId?: string | null };
type Bulletin = {
  id: string;
  studentId: string;
  term: number;
  academicYear: string;
  average: number;
  rank: number | null;
  mention: string;
  appreciation: string;
  status: 'DRAFT' | 'PENDING_TITULAIRE' | 'VALIDATED_TITULAIRE' | 'PENDING_ADMIN' | 'VALIDATED_ADMIN' | 'PUBLISHED';
  student: { id: string; fullName: string; matricule?: string | null };
};

const STATUS_LABEL: Record<Bulletin['status'], string> = {
  DRAFT: 'Brouillon',
  PENDING_TITULAIRE: 'En attente du titulaire',
  VALIDATED_TITULAIRE: 'Transmis à la direction',
  PENDING_ADMIN: 'En attente de la direction',
  VALIDATED_ADMIN: 'Validé par la direction',
  PUBLISHED: 'Publié',
};

function cacheKey(userId: string, schoolId: string, classId: string, term: number) {
  return `gradeup:teacher-bulletins:${schoolId}:${userId}:${classId}:${term}`;
}

export default function TeacherCanonicalBulletins() {
  const user = useAppStore((state) => state.user);
  const [classes, setClasses] = useState<TitularClass[]>([]);
  const [classId, setClassId] = useState('');
  const [term, setTerm] = useState('1');
  const [bulletins, setBulletins] = useState<Bulletin[]>([]);
  const [appreciations, setAppreciations] = useState<Record<string, string>>({});
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingBulletins, setLoadingBulletins] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [offlineView, setOfflineView] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoadingClasses(true);
    fetch(`/api/classes?schoolId=${encodeURIComponent(user.schoolId)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de charger les classes.');
        const titularClasses = (Array.isArray(data.classes) ? data.classes : [])
          .filter((klass: TitularClass) => klass.titulaireId === user.id);
        if (!cancelled) {
          setClasses(titularClasses);
          setClassId((current) => current || titularClasses[0]?.id || '');
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossible de charger les classes.');
      })
      .finally(() => { if (!cancelled) setLoadingClasses(false); });
    return () => { cancelled = true; };
  }, [user]);

  const refreshBulletins = useCallback(async () => {
    if (!user || !classId) { setBulletins([]); return; }
    setLoadingBulletins(true);
    setError('');
    setOfflineView(false);
    const key = cacheKey(user.id, user.schoolId, classId, Number(term));
    try {
      const params = new URLSearchParams({ schoolId: user.schoolId, classId, term });
      const response = await fetch(`/api/bulletins?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les bulletins.');
      const rows = Array.isArray(data.bulletins) ? data.bulletins as Bulletin[] : [];
      setBulletins(rows);
      setAppreciations(Object.fromEntries(rows.map((bulletin) => [bulletin.id, bulletin.appreciation || ''])));
      localStorage.setItem(key, JSON.stringify(rows));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Connexion indisponible.';
      try {
        const cached = localStorage.getItem(key);
        if (cached) {
          const rows = JSON.parse(cached) as Bulletin[];
          setBulletins(Array.isArray(rows) ? rows : []);
          setAppreciations(Object.fromEntries(rows.map((bulletin) => [bulletin.id, bulletin.appreciation || ''])));
          setOfflineView(true);
          setError('Mode hors ligne : affichage de la dernière copie consultée.');
          return;
        }
      } catch { /* cache local invalide: afficher l'erreur réseau */ }
      setBulletins([]);
      setError(message);
    } finally {
      setLoadingBulletins(false);
    }
  }, [user, classId, term]);

  useEffect(() => { void refreshBulletins(); }, [refreshBulletins]);

  const counts = useMemo(() => ({
    drafts: bulletins.filter((bulletin) => bulletin.status === 'DRAFT').length,
    transmitted: bulletins.filter((bulletin) => ['VALIDATED_TITULAIRE', 'PENDING_ADMIN', 'VALIDATED_ADMIN', 'PUBLISHED'].includes(bulletin.status)).length,
  }), [bulletins]);

  const generate = async () => {
    if (!user || !classId) return;
    if (!navigator.onLine) { toast.error('La génération requiert une connexion.'); return; }
    setGenerating(true);
    try {
      const response = await fetch('/api/bulletins/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, term: Number(term) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'La génération a échoué.');
      toast.success(`${data.generated?.length ?? 0} bulletin(s) généré(s).`);
      await refreshBulletins();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'La génération a échoué.');
    } finally {
      setGenerating(false);
    }
  };

  const validate = async (bulletin: Bulletin) => {
    if (!navigator.onLine) { toast.error('La validation du titulaire requiert une connexion.'); return; }
    setSavingId(bulletin.id);
    try {
      const response = await fetch(`/api/bulletins/${bulletin.id}/validate-titulaire`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appreciation: appreciations[bulletin.id] || '' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'La validation a échoué.');
      toast.success(`Bulletin de ${bulletin.student.fullName} transmis à la direction.`);
      await refreshBulletins();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'La validation a échoué.');
    } finally {
      setSavingId(null);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-col gap-3 rounded-xl border bg-gradient-to-r from-blue-50 to-indigo-50 p-5 dark:from-blue-950/30 dark:to-indigo-950/30 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bulletins de titulaire</h1>
          <p className="mt-1 text-sm text-muted-foreground">Générez les brouillons à partir des notes réelles, relisez-les et transmettez-les à la direction.</p>
        </div>
        <Button className="min-h-11 gap-2" variant="outline" onClick={() => void refreshBulletins()} disabled={loadingBulletins}>
          <RefreshCw className={`size-4 ${loadingBulletins ? 'animate-spin' : ''}`} /> Actualiser
        </Button>
      </div>

      {error && <Alert variant={offlineView ? 'default' : 'destructive'}><AlertCircle className="size-4" /><AlertDescription>{error}</AlertDescription></Alert>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Période et classe</CardTitle>
          <CardDescription>Les bulletins existants restent en lecture seule hors ligne. Génération et validation sont en ligne uniquement.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Select value={classId} onValueChange={setClassId} disabled={loadingClasses || classes.length === 0}>
            <SelectTrigger className="min-h-11 flex-1"><SelectValue placeholder={loadingClasses ? 'Chargement…' : 'Choisir une classe titulaire'} /></SelectTrigger>
            <SelectContent>{classes.map((klass) => <SelectItem key={klass.id} value={klass.id}>{klass.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={term} onValueChange={setTerm}>
            <SelectTrigger className="min-h-11 sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 2, 3, 4].map((value) => <SelectItem key={value} value={String(value)}>Période {value}</SelectItem>)}</SelectContent>
          </Select>
          <Button className="min-h-11 gap-2" onClick={() => void generate()} disabled={!classId || generating || loadingClasses}>
            <BookOpenCheck className="size-4" /> {generating ? 'Génération…' : 'Générer les brouillons'}
          </Button>
        </CardContent>
      </Card>

      {!loadingClasses && classes.length === 0 && <Alert><AlertCircle className="size-4" /><AlertDescription>Aucune classe ne vous est attribuée comme titulaire. Demandez à l’administration de vous affecter à une classe.</AlertDescription></Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Brouillons à relire</p><p className="text-2xl font-semibold">{counts.drafts}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Transmis / traités</p><p className="text-2xl font-semibold">{counts.transmitted}</p></CardContent></Card>
      </div>

      {loadingBulletins ? <div className="space-y-3">{[0, 1, 2].map((value) => <Skeleton key={value} className="h-40 rounded-xl" />)}</div> : bulletins.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Aucun bulletin pour cette classe et cette période. Générez les brouillons après la saisie des notes.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {bulletins.map((bulletin) => (
            <Card key={bulletin.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{bulletin.student.fullName}</h2>
                    <p className="text-xs text-muted-foreground">{bulletin.student.matricule || 'Matricule non renseigné'} · {bulletin.academicYear} · Période {bulletin.term}</p>
                  </div>
                  <Badge variant={bulletin.status === 'PUBLISHED' ? 'default' : bulletin.status === 'DRAFT' ? 'outline' : 'secondary'}>{STATUS_LABEL[bulletin.status] || bulletin.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div className="rounded-lg bg-muted/50 p-2"><span className="block text-xs text-muted-foreground">Moyenne</span><strong>{bulletin.average.toFixed(2)}/20</strong></div>
                  <div className="rounded-lg bg-muted/50 p-2"><span className="block text-xs text-muted-foreground">Rang</span><strong>{bulletin.rank ? `${bulletin.rank}e` : '—'}</strong></div>
                  <div className="rounded-lg bg-muted/50 p-2"><span className="block text-xs text-muted-foreground">Mention</span><strong>{bulletin.mention || '—'}</strong></div>
                  <div className="rounded-lg bg-muted/50 p-2"><span className="block text-xs text-muted-foreground">Statut</span><strong>{STATUS_LABEL[bulletin.status]}</strong></div>
                </div>
                {bulletin.status === 'DRAFT' ? (
                  <>
                    <Textarea
                      className="min-h-20"
                      value={appreciations[bulletin.id] || ''}
                      onChange={(event) => setAppreciations((current) => ({ ...current, [bulletin.id]: event.target.value }))}
                      placeholder="Appréciation du titulaire (facultative)"
                      aria-label={`Appréciation du titulaire pour ${bulletin.student.fullName}`}
                      disabled={offlineView}
                    />
                    {!offlineView && <Button className="min-h-11 w-full gap-2 sm:w-auto" onClick={() => void validate(bulletin)} disabled={savingId === bulletin.id}>
                      {savingId === bulletin.id ? <RefreshCw className="size-4 animate-spin" /> : <Send className="size-4" />}
                      Transmettre à la direction
                    </Button>}
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><Check className="size-4" />{bulletin.appreciation || 'Transmis selon le workflow de validation.'}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
