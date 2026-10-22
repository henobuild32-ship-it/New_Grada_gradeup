'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  CalendarDays,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Plus,
  Calendar,
  Clock,
  Trash2,
  ShieldAlert,
} from 'lucide-react';

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const CYCLES = ['Maternelle', 'Primaire', 'EB', 'Humanites'];

interface CalendarRow {
  id: string;
  schoolYearId: string;
  month: number;
  monthName: string;
  trimester: number | null;
  semester: number | null;
  period: string;
  cycle: string;
}

interface SchoolYearRow {
  id: string;
  year: string;
  status: string;
}

interface PeriodItem {
  id: string;
  name: string;
  code: string;
  trimester: number;
  semester: number | null;
  startDate: string;
  endDate: string;
  status: string;
  isLocked: boolean;
  schoolYearId?: string;
}

interface AcademicClosureItem {
  id: string;
  scope: string;
  key: string;
  closedAt: string;
}

export default function AdminSchoolCalendar() {
  const { user } = useAppStore();
  const [activeTab, setActiveTab] = useState<'periods' | 'calendar' | 'closures'>('periods');

  // School Years
  const [years, setYears] = useState<SchoolYearRow[]>([]);
  const [selectedYearId, setSelectedYearId] = useState('');
  const [showNewYearModal, setShowNewYearModal] = useState(false);
  const [newYearInput, setNewYearInput] = useState('');
  const [creatingYear, setCreatingYear] = useState(false);

  // Periods State
  const [periods, setPeriods] = useState<PeriodItem[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [togglingLockId, setTogglingLockId] = useState<string | null>(null);
  const [seedingPeriods, setSeedingPeriods] = useState(false);

  // Calendar Mapping State
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [cycle, setCycle] = useState('ALL');
  const [loadingCalendar, setLoadingCalendar] = useState(true);
  const [seedingCalendar, setSeedingCalendar] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [edits, setEdits] = useState<Record<string, { period: string; trimester: number | null; semester: number | null }>>({});

  // Closures / Vacations State
  const [closures, setClosures] = useState<AcademicClosureItem[]>([]);
  const [loadingClosures, setLoadingClosures] = useState(false);
  const [showAddClosureModal, setShowAddClosureModal] = useState(false);
  const [closureScope, setClosureScope] = useState('WEEK');
  const [closureKey, setClosureKey] = useState('');
  const [creatingClosure, setCreatingClosure] = useState(false);

  const dirtyCount = Object.keys(edits).length;

  // Load Years
  const loadYears = useCallback(async () => {
    if (!user?.schoolId) return;
    try {
      const res = await fetch(`/api/school-years?schoolId=${user.schoolId}`);
      const data = await res.json();
      const list = Array.isArray(data.years) ? data.years : [];
      setYears(list);
      const active = list.find((y: SchoolYearRow) => y.status === 'OPEN') || list[0];
      if (active && !selectedYearId) setSelectedYearId(active.id);
    } catch {
      toast.error('Erreur lors du chargement des années scolaires');
    }
  }, [user?.schoolId, selectedYearId]);

  // Load Periods
  const loadPeriods = useCallback(async () => {
    if (!user?.schoolId) return;
    setLoadingPeriods(true);
    try {
      const res = await fetch(`/api/periods?schoolId=${user.schoolId}`);
      const data = await res.json();
      const list = Array.isArray(data.data) ? data.data : Array.isArray(data.periods) ? data.periods : [];
      setPeriods(list);
    } catch {
      toast.error('Erreur lors du chargement des périodes de cotation');
    } finally {
      setLoadingPeriods(false);
    }
  }, [user?.schoolId]);

  // Load Month Calendar
  const loadCalendar = useCallback(async () => {
    if (!user?.schoolId || !selectedYearId) return;
    setLoadingCalendar(true);
    try {
      const params = new URLSearchParams({ schoolId: user.schoolId, schoolYearId: selectedYearId });
      if (cycle !== 'ALL') params.set('cycle', cycle);
      const res = await fetch(`/api/calendar?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data.calendar) ? data.calendar : []);
    } catch {
      toast.error('Erreur lors du chargement du calendrier');
    } finally {
      setLoadingCalendar(false);
    }
  }, [user?.schoolId, selectedYearId, cycle]);

  // Load Closures
  const loadClosures = useCallback(async () => {
    if (!user?.schoolId || !selectedYearId) return;
    setLoadingClosures(true);
    try {
      const res = await fetch(`/api/academic-closures?schoolYearId=${selectedYearId}`);
      const data = await res.json();
      setClosures(Array.isArray(data.closures) ? data.closures : []);
    } catch {
      console.warn('Erreur chargement fermetures');
    } finally {
      setLoadingClosures(false);
    }
  }, [user?.schoolId, selectedYearId]);

  useEffect(() => {
    if (user?.schoolId) {
      loadYears();
      loadPeriods();
    }
  }, [user?.schoolId, loadYears, loadPeriods]);

  useEffect(() => {
    if (selectedYearId) {
      loadCalendar();
      loadClosures();
    }
  }, [selectedYearId, loadCalendar, loadClosures]);

  // Toggle Period Lock / Unlock
  const handleToggleLock = async (p: PeriodItem) => {
    setTogglingLockId(p.id);
    const newLockState = !p.isLocked;
    try {
      const res = await fetch(`/api/periods/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLocked: newLockState }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur lors du verrouillage');
      }

      setPeriods((prev) =>
        prev.map((item) => (item.id === p.id ? { ...item, isLocked: newLockState } : item))
      );
      toast.success(
        newLockState
          ? `Saisie des notes VERROUILLÉE pour ${p.name}`
          : `Saisie des notes OUVERTE pour ${p.name}`
      );
    } catch (e: any) {
      toast.error(e.message || 'Impossible de modifier le verrouillage');
    } finally {
      setTogglingLockId(null);
    }
  };

  // Bulk Lock / Unlock All Periods
  const handleBulkLock = async (lockAll: boolean) => {
    if (periods.length === 0) return;
    const actionLabel = lockAll ? 'verrouiller' : 'déverrouiller';
    if (!confirm(`Voulez-vous ${actionLabel} la saisie des notes pour toutes les périodes ?`)) return;

    try {
      await Promise.all(
        periods.map((p) =>
          fetch(`/api/periods/${p.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isLocked: lockAll }),
          })
        )
      );
      setPeriods((prev) => prev.map((p) => ({ ...p, isLocked: lockAll })));
      toast.success(
        lockAll
          ? 'Toutes les périodes ont été verrouillées.'
          : 'Toutes les périodes ont été déverrouillées pour la saisie.'
      );
    } catch {
      toast.error('Erreur lors de la mise à jour groupée');
    }
  };

  // Seed Default RDC Periods
  const handleSeedPeriods = async () => {
    setSeedingPeriods(true);
    try {
      const res = await fetch('/api/periods/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolYearId: selectedYearId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success(data.message || 'Périodes RDC officielles initialisées');
      loadPeriods();
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'initialisation des périodes");
    } finally {
      setSeedingPeriods(false);
    }
  };

  // Create New School Year
  const handleCreateYear = async () => {
    if (!newYearInput.trim()) {
      toast.error("Veuillez saisir une année scolaire (ex: 2026-2027)");
      return;
    }
    setCreatingYear(true);
    try {
      const res = await fetch('/api/school-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: newYearInput.trim(), status: 'OPEN' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur de création');
      toast.success(`Année scolaire ${newYearInput} créée`);
      setShowNewYearModal(false);
      setNewYearInput('');
      loadYears();
      if (data.year?.id) setSelectedYearId(data.year.id);
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la création de l'année");
    } finally {
      setCreatingYear(false);
    }
  };

  // Add Closure / Vacation
  const handleAddClosure = async () => {
    if (!closureKey.trim() || !selectedYearId) {
      toast.error('Veuillez préciser le motif ou la date de fermeture');
      return;
    }
    setCreatingClosure(true);
    try {
      const res = await fetch('/api/academic-closures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolYearId: selectedYearId,
          scope: closureScope,
          key: closureKey.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur');
      }
      toast.success('Période de fermeture / vacance enregistrée');
      setShowAddClosureModal(false);
      setClosureKey('');
      loadClosures();
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de la fermeture');
    } finally {
      setCreatingClosure(false);
    }
  };

  const handleDeleteClosure = async (closureId: string) => {
    try {
      const res = await fetch(`/api/academic-closures?id=${closureId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur de réouverture');
      toast.success('Clôture levée');
      loadClosures();
    } catch {
      toast.error('Impossible de supprimer cette clôture');
    }
  };

  // Calendar Edits
  const displayRows = cycle === 'ALL' ? rows : rows.filter((r) => r.cycle === cycle || r.cycle === 'ALL');

  const setEdit = (key: string, patch: Partial<{ period: string; trimester: number | null; semester: number | null }>) => {
    setEdits((prev) => {
      const next = { ...prev };
      const base = next[key] ?? { period: 'P1', trimester: null, semester: null };
      next[key] = { ...base, ...patch };
      return next;
    });
  };

  const editKey = (r: CalendarRow) => `${r.schoolYearId}_${r.month}_${r.cycle}`;

  const periodColor = (p: string) => {
    if (p.startsWith('Ex')) return 'bg-red-100 text-red-700 border-red-200';
    if (p === 'P2' || p === 'P4') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (p === 'P3') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    return 'bg-blue-100 text-blue-700 border-blue-200';
  };

  const saveAllCalendar = async () => {
    setSavingCalendar(true);
    try {
      const entries = Object.entries(edits);
      for (const [key, val] of entries) {
        const [schoolYearId, monthStr, cycleVal] = key.split('_');
        const res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schoolYearId,
            month: parseInt(monthStr, 10),
            cycle: cycleVal,
            period: val.period,
            trimester: val.trimester,
            semester: val.semester,
          }),
        });
        if (!res.ok) throw new Error('Erreur lors de la sauvegarde');
      }
      toast.success('Calendrier mensuel mis à jour');
      setEdits({});
      loadCalendar();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erreur de sauvegarde');
    } finally {
      setSavingCalendar(false);
    }
  };

  const seedDefaultCalendar = async () => {
    setSeedingCalendar(true);
    try {
      const res = await fetch('/api/calendar/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolYearId: selectedYearId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success(`${data.seeded} entrées générées (calendrier par défaut RDC)`);
      loadCalendar();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erreur seed');
    } finally {
      setSeedingCalendar(false);
    }
  };

  const activeYearObj = years.find((y) => y.id === selectedYearId);

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 p-6 lg:p-8 text-white shadow-xl shadow-blue-500/20">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-white/15 backdrop-blur-sm shrink-0">
              <CalendarDays className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Calendrier Scolaire & Périodes RDC</h1>
              <p className="text-blue-100 text-xs sm:text-sm">
                Année active : <span className="font-semibold underline">{activeYearObj?.year || 'Non définie'}</span> · Contrôle de verrouillage de saisie des cotes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowNewYearModal(true)}
              className="min-h-[44px] bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow-md"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nouvelle Année
            </Button>
          </div>
        </div>
      </div>

      {/* Year Selector Control Bar */}
      <Card className="p-4 shadow-sm border">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={selectedYearId} onValueChange={setSelectedYearId}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue placeholder="Sélectionnez l'année scolaire..." />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.year} {y.status === 'OPEN' ? '🟢 (En cours)' : y.status === 'LOCKED' ? '🔒 (Verrouillée)' : '⚪ (Clôturée)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{periods.length}</span> périodes configurées ·{' '}
            <span className="font-medium text-foreground">{closures.length}</span> congés & fermetures
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
        <TabsList className="grid grid-cols-3 min-h-[48px] p-1 bg-muted/60 rounded-xl">
          <TabsTrigger value="periods" className="min-h-[40px] text-xs sm:text-sm font-semibold">
            Périodes & Notes 🔒
          </TabsTrigger>
          <TabsTrigger value="calendar" className="min-h-[40px] text-xs sm:text-sm font-semibold">
            Mois & Cycles (RDC)
          </TabsTrigger>
          <TabsTrigger value="closures" className="min-h-[40px] text-xs sm:text-sm font-semibold">
            Congés & Clôtures
          </TabsTrigger>
        </TabsList>

        {/* ============================================================== */}
        {/* TAB 1: PERIODS & GRADE LOCKING (P1 to P4 + EXAMS)               */}
        {/* ============================================================== */}
        <TabsContent value="periods" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-foreground">Périodes d'évaluation & Verrouillage</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Verrouillez ou déverrouillez en 1 clic la saisie des points par les enseignants pour chaque période.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkLock(false)}
                className="min-h-[44px] text-xs font-semibold text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              >
                <Unlock className="h-3.5 w-3.5 mr-1.5" />
                Tout déverrouiller
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkLock(true)}
                className="min-h-[44px] text-xs font-semibold text-amber-700 border-amber-200 hover:bg-amber-50"
              >
                <Lock className="h-3.5 w-3.5 mr-1.5" />
                Tout verrouiller
              </Button>
              {periods.length === 0 && (
                <Button
                  onClick={handleSeedPeriods}
                  disabled={seedingPeriods}
                  className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  {seedingPeriods ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Générer P1 à P4 & Examens RDC
                </Button>
              )}
            </div>
          </div>

          {loadingPeriods ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : periods.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <div className="mx-auto w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                <CalendarDays className="h-7 w-7" />
              </div>
              <h4 className="font-bold text-base mb-1">Aucune période configurée</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Initialisez les 6 périodes officielles du système éducatif en RDC (P1, P2, Examen Semestre 1, P3, P4, Examen Semestre 2).
              </p>
              <Button
                onClick={handleSeedPeriods}
                disabled={seedingPeriods}
                className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                {seedingPeriods ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Générer les périodes RDC
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {periods.map((p) => {
                const isToggling = togglingLockId === p.id;
                return (
                  <Card
                    key={p.id}
                    className={`transition-all duration-200 border-l-4 ${
                      p.isLocked
                        ? 'border-l-amber-500 bg-amber-50/20'
                        : 'border-l-emerald-500 bg-emerald-50/10'
                    }`}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Badge variant="outline" className="font-mono text-xs uppercase font-bold tracking-wider mb-1">
                            {p.code}
                          </Badge>
                          <h4 className="font-bold text-base text-foreground leading-tight">{p.name}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Semestre {p.semester || 1} · {p.startDate} au {p.endDate}
                          </p>
                        </div>
                        <Badge
                          className={`text-xs font-semibold px-2.5 py-1 ${
                            p.isLocked
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          }`}
                        >
                          {p.isLocked ? 'Verrouillée 🔒' : 'Ouverte ✍️'}
                        </Badge>
                      </div>

                      <div className="pt-2 border-t flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground font-medium">
                          {p.isLocked ? 'Saisie des notes bloquée' : 'Enseignants autorisés à saisir'}
                        </span>
                        <Button
                          size="sm"
                          variant={p.isLocked ? 'default' : 'outline'}
                          onClick={() => handleToggleLock(p)}
                          disabled={isToggling}
                          className={`min-h-[44px] text-xs font-bold gap-1.5 ${
                            p.isLocked
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'text-amber-700 border-amber-300 hover:bg-amber-50'
                          }`}
                        >
                          {isToggling ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : p.isLocked ? (
                            <>
                              <Unlock className="h-3.5 w-3.5" />
                              Déverrouiller
                            </>
                          ) : (
                            <>
                              <Lock className="h-3.5 w-3.5" />
                              Verrouiller
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* TAB 2: MONTH CALENDAR & CYCLE MAPPING                          */}
        {/* ============================================================== */}
        <TabsContent value="calendar" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Filtrer par Cycle</label>
                <Select value={cycle} onValueChange={setCycle}>
                  <SelectTrigger className="min-h-[44px] w-48">
                    <SelectValue placeholder="Tous les cycles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tous les cycles</SelectItem>
                    {CYCLES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={seedDefaultCalendar}
              disabled={seedingCalendar}
              className="min-h-[44px] border-indigo-300 text-indigo-700 hover:bg-indigo-50 font-semibold"
            >
              {seedingCalendar ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Générer le calendrier par défaut
            </Button>
          </div>

          {loadingCalendar ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : displayRows.length === 0 ? (
            <Card className="py-12 text-center text-muted-foreground">
              <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
              <p className="font-semibold text-foreground">Aucune entrée pour ce cycle</p>
              <p className="text-sm mt-1">Cliquez sur « Générer le calendrier par défaut » pour initialiser.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {displayRows.map((r) => {
                const key = editKey(r);
                const edit = edits[key];
                const cur = edit ?? { period: r.period, trimester: r.trimester, semester: r.semester };
                return (
                  <Card key={r.id} className={`rounded-xl ${edit ? 'ring-2 ring-blue-400 border-blue-200' : ''}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">
                          {MONTH_NAMES[r.month - 1]} <span className="text-muted-foreground font-normal">({r.month})</span>
                        </span>
                        <Badge variant="outline" className={`text-[10px] font-bold ${periodColor(cur.period)}`}>
                          {cur.period}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">Semestre</label>
                          <Select
                            value={cur.semester?.toString() ?? 'none'}
                            onValueChange={(v) => setEdit(key, { semester: v && v !== 'none' ? parseInt(v, 10) : null })}
                          >
                            <SelectTrigger className="min-h-[44px] text-xs">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {['none', '1', '2'].map((s) => (
                                <SelectItem key={s} value={s}>{s === 'none' ? '—' : `Semestre ${s}`}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">Période</label>
                          <Select
                            value={cur.period}
                            onValueChange={(v) => setEdit(key, { period: v })}
                          >
                            <SelectTrigger className="min-h-[44px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {['P1', 'P2', 'P3', 'P4', 'ExS1', 'ExS2', 'ExT1', 'ExT2', 'ExT3'].map((p) => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                        <span>Cycle : {r.cycle}</span>
                        {edit && <span className="text-blue-600 font-bold text-[10px]">Modifié</span>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Sticky Save Bar */}
          {dirtyCount > 0 && (
            <div className="sticky bottom-4 z-10">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-white/95 dark:bg-card/95 backdrop-blur shadow-xl p-4">
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                  {dirtyCount} mois modifié(s) en attente
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEdits({})} className="min-h-[44px]">
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveAllCalendar}
                    disabled={savingCalendar}
                    className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  >
                    {savingCalendar ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Enregistrer les modifications
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* TAB 3: CLOSURES & VACATIONS                                   */}
        {/* ============================================================== */}
        <TabsContent value="closures" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-foreground">Vacances, Fériés & Clôtures Scolaires</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Consignez les jours de fermeture exceptionnelle, les congés de détente ou les congés de Pâques.
              </p>
            </div>
            <Button
              onClick={() => setShowAddClosureModal(true)}
              className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Déclarer un congé / fermeture
            </Button>
          </div>

          {loadingClosures ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : closures.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3 text-muted-foreground">
                <Calendar className="h-6 w-6" />
              </div>
              <h4 className="font-semibold text-base mb-1">Aucune fermeture enregistrée</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Toutes les semaines et mois de l'année scolaire sont actuellement ouverts.
              </p>
              <Button
                variant="outline"
                onClick={() => setShowAddClosureModal(true)}
                className="min-h-[44px]"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Ajouter une période de vacance
              </Button>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {closures.map((c) => (
                <Card key={c.id} className="hover:shadow-sm transition-all border-l-4 border-l-purple-500">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700 dark:bg-purple-950/30">
                        <Calendar className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            {c.scope}
                          </Badge>
                          <h4 className="font-bold text-base text-foreground">{c.key}</h4>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Enregistré le {new Date(c.closedAt).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClosure(c.id)}
                      className="min-h-[44px] text-red-500 hover:text-red-700 hover:bg-red-50 font-semibold gap-1 text-xs"
                    >
                      <Trash2 className="h-4 w-4" />
                      Lever la fermeture
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal: New School Year */}
      <Dialog open={showNewYearModal} onOpenChange={setShowNewYearModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Nouvelle Année Scolaire
            </DialogTitle>
            <DialogDescription>
              Créez une nouvelle année académique et définissez-la comme active.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="year-name">Année scolaire (ex: 2026-2027) *</Label>
              <Input
                id="year-name"
                placeholder="2026-2027"
                value={newYearInput}
                onChange={(e) => setNewYearInput(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowNewYearModal(false)} className="min-h-[44px]">
              Annuler
            </Button>
            <Button
              onClick={handleCreateYear}
              disabled={creatingYear || !newYearInput.trim()}
              className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {creatingYear ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Créer l'année
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Add Closure / Vacation */}
      <Dialog open={showAddClosureModal} onOpenChange={setShowAddClosureModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-purple-600" />
              Déclarer un congé / fermeture
            </DialogTitle>
            <DialogDescription>
              Précisez l'étendue et le motif de la clôture scolaire.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Portée de la fermeture</Label>
              <Select value={closureScope} onValueChange={setClosureScope}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAY">Jour férié / Journée (DAY)</SelectItem>
                  <SelectItem value="WEEK">Semaine de vacances (WEEK)</SelectItem>
                  <SelectItem value="MONTH">Mois complet (MONTH)</SelectItem>
                  <SelectItem value="SEMESTER">Semestre (SEMESTER)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Motif / Intitulé *</Label>
              <Input
                placeholder="Ex: Vacances de détente (Toussaint), Jour des Martyrs 4 Janvier..."
                value={closureKey}
                onChange={(e) => setClosureKey(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowAddClosureModal(false)} className="min-h-[44px]">
              Annuler
            </Button>
            <Button
              onClick={handleAddClosure}
              disabled={creatingClosure || !closureKey.trim()}
              className="min-h-[44px] bg-purple-600 hover:bg-purple-700 text-white font-semibold"
            >
              {creatingClosure ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}