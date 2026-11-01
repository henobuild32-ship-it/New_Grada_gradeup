'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import type { GradeInfo } from '@/lib/types';
import type { LocalRecord } from '@/lib/offline/types';
import { useEntityListState } from '@/lib/offline/hooks';
import { Card, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { TrendingUp, Award, AlertTriangle, BarChart3, RefreshCw } from 'lucide-react';

type LocalGrade = GradeInfo & LocalRecord;

function extractGrades(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== 'object') return [];
  const grades = (data as { grades?: unknown }).grades;
  return Array.isArray(grades) ? grades as Record<string, unknown>[] : [];
}

export default function StudentGrades() {
  const user = useAppStore((s) => s.user);
  const [trimester, setTrimester] = useState('P1');
  const gradeViews = [
    { key: 'P1', label: 'Première période', title: 'Première période' },
    { key: 'P2', label: 'Deuxième période', title: 'Deuxième période' },
    { key: 'P3', label: 'Troisième période', title: 'Troisième période' },
    { key: '1', label: 'Premier trimestre', title: 'Premier trimestre' },
    { key: 'P4', label: 'Quatrième période', title: 'Quatrième période' },
    { key: '2', label: 'Deuxième trimestre', title: 'Deuxième trimestre' },
    { key: '3', label: 'Troisième trimestre', title: 'Troisième trimestre' },
  ];
  const selectedGradeView = gradeViews.find((view) => view.key === trimester) ?? gradeViews[0];
  const gradeFilter = useCallback(
    (record: LocalRecord) => {
      const grade = record as LocalGrade;
      if (grade.studentId !== user?.id) return false;
      if (trimester === '1') return ['1', 'P1', 'P2', 'EX1'].includes(grade.trimester);
      if (trimester === '2') return ['2', 'P3', 'P4', 'EX2'].includes(grade.trimester);
      return grade.trimester === trimester;
    },
    [trimester, user?.id]
  );
  const gradeQuery = user?.schoolId && user?.id
    ? new URLSearchParams({ schoolId: user.schoolId, studentId: user.id, trimester }).toString()
    : null;
  const { data: grades, loading, refreshing, error, refresh } = useEntityListState<LocalGrade>(
    'grades',
    user?.schoolId,
    {
      remoteUrl: gradeQuery ? `/api/grades?${gradeQuery}` : undefined,
      extract: extractGrades,
      filter: gradeFilter,
    }
  );

  const handleRefresh = async () => {
    await refresh();
  };
  const loadError = user?.id ? error : 'Votre session élève est indisponible. Reconnectez-vous puis réessayez.';

  const trimesterLabels: Record<string, string> = {
    '1': '1er trimestre', '2': '2e trimestre', '3': '3e trimestre',
    P1: 'Première période', P2: 'Deuxième période', P3: 'Troisième période', P4: 'Quatrième période',
    EX1: 'Examen du 1er trimestre', EX2: 'Examen du 2e trimestre',
  };

  // Group grades by course so each course shows its period breakdown + average.
  const groupedByCourse = useMemo(() => {
    const map = new Map<string, GradeInfo[]>();
    for (const g of grades) {
      const list = map.get(g.courseId) || [];
      list.push(g);
      map.set(g.courseId, list);
    }
    return Array.from(map.entries()).map(([courseId, list]) => {
      const course = list[0].course;
      // Preserve the school's configured maximum for each period/exam. A
      // simple average would incorrectly give an exam the same weight as a
      // smaller continuous-assessment mark.
      const earned = list.reduce((sum, grade) => sum + grade.score, 0);
      const possible = list.reduce((sum, grade) => sum + (grade.maxScore > 0 ? grade.maxScore : 20), 0);
      const avg = possible > 0 ? (earned / possible) * 20 : 0;
      return {
        courseId,
        courseName: course?.name || '—',
        coeff: list[0]?.effectiveCoefficient ?? course?.coefficient ?? 1,
        grades: list,
        average: Math.round(avg * 100) / 100,
      };
    });
  }, [grades]);

  // Weighted general average by course (coefficient-aware), matching the bulletin.
  const average = groupedByCourse.length > 0
      ? groupedByCourse.reduce((sum, e) => sum + e.average * e.coeff, 0) /
        groupedByCourse.reduce((sum, e) => sum + e.coeff, 0)
      : 0;

  const getGradeColor = (score: number, maxScore: number) => {
    const val = (score / maxScore) * 20;
    if (val >= 16) return 'text-green-600 dark:text-green-400';
    if (val >= 14) return 'text-blue-600 dark:text-blue-400';
    if (val >= 12) return 'text-yellow-600 dark:text-yellow-400';
    if (val >= 10) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getGradeBg = (score: number, maxScore: number) => {
    const val = (score / maxScore) * 20;
    if (val >= 16) return 'bg-green-50 text-green-700 border border-green-200';
    if (val >= 14) return 'bg-blue-50 text-blue-700 border border-blue-200';
    if (val >= 12) return 'bg-yellow-50 text-yellow-700 border border-yellow-200';
    if (val >= 10) return 'bg-orange-50 text-orange-700 border border-orange-200';
    return 'bg-red-50 text-red-700 border border-red-200';
  };

  const getProgressColor = (score: number, maxScore: number) => {
    const val = (score / maxScore) * 20;
    if (val >= 16) return 'bg-green-500';
    if (val >= 14) return 'bg-blue-500';
    if (val >= 12) return 'bg-yellow-500';
    if (val >= 10) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getAverageBadge = (avg: number) => {
    if (avg >= 16) return { label: '🟢 Excellent', className: 'bg-green-50 text-green-700 border-green-200' };
    if (avg >= 14) return { label: '🔵 Très bien', className: 'bg-blue-50 text-blue-700 border-blue-200' };
    if (avg >= 12) return { label: '🟡 Bien', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
    if (avg >= 10) return { label: '🟠 Assez bien', className: 'bg-orange-50 text-orange-700 border-orange-200' };
    return { label: '🔴 Insuffisant', className: 'bg-red-50 text-red-700 border-red-200' };
  };

  const getAverageIcon = (avg: number) => {
    if (avg >= 14) return <Award className="h-8 w-8 text-emerald-600 animate-pulse-soft" />;
    if (avg >= 10) return <TrendingUp className="h-8 w-8 text-blue-500" />;
    return <AlertTriangle className="h-8 w-8 text-red-500" />;
  };

  const getSparkline = () => {
    if (grades.length < 2) return null;
    const width = 120;
    const height = 30;
    const maxVal = 20;
    const minVal = 0;
    
    const points = grades.map((g, idx) => {
      const x = (idx / (grades.length - 1)) * (width - 10) + 5;
      const normalizedScore = (g.score / g.maxScore) * 20;
      const y = height - ((normalizedScore - minVal) / (maxVal - minVal)) * (height - 10) - 5;
      return `${x},${y}`;
    }).join(' ');
    
    return (
      <svg className="w-28 h-8 text-blue-600 dark:text-blue-400 shrink-0 hidden sm:block" viewBox={`0 0 ${width} ${height}`}>
        <polyline fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
        {grades.map((g, idx) => {
          const x = (idx / (grades.length - 1)) * (width - 10) + 5;
          const normalizedScore = (g.score / g.maxScore) * 20;
          const y = height - ((normalizedScore - minVal) / (maxVal - minVal)) * (height - 10) - 5;
          return (
            <circle key={idx} cx={x} cy={y} r="2.5" className="fill-blue-600 dark:fill-blue-400 stroke-background stroke-[1.5px]" />
          );
        })}
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-9 w-80 rounded-md" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (loadError && grades.length === 0) {
    return <ErrorState title="Notes indisponibles" description={loadError} onRetry={() => void handleRefresh()} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="mb-6 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mes notes</h1>
          <p className="text-sm text-muted-foreground mt-1">Suivez vos performances académiques par trimestre</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          className="min-h-11 self-start rounded-full shadow-sm"
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Actualisation...' : 'Actualiser'}
        </Button>
      </div>

      {loadError && grades.length > 0 && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          Affichage des notes enregistrées sur cet appareil. {loadError}
        </div>
      )}

      {/* Average Card */}
      <Card className="bg-gradient-to-r from-blue-50 via-blue-50 to-indigo-50 border-blue-200 shadow-sm relative overflow-hidden">
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <CardDescription className="text-sm font-medium text-blue-700">
              Moyenne générale — {selectedGradeView.title}
            </CardDescription>
            <p className="text-4xl font-bold mt-1" style={{ color: average >= 16 ? '#16a34a' : average >= 14 ? '#2563eb' : average >= 12 ? '#ca8a04' : average >= 10 ? '#ea580c' : '#dc2626' }}>
              {grades.length > 0 ? average.toFixed(2) : '—'}
              <span className="text-lg text-muted-foreground ml-1">/20</span>
            </p>
            <div className="mt-2">
              {grades.length > 0 && (() => { const badge = getAverageBadge(average); return <Badge variant="outline" className={badge.className}>{badge.label}</Badge>; })()}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {grades.length >= 2 && getSparkline()}
            <div className="flex items-center gap-3">
              {grades.length > 0 && getAverageIcon(average)}
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{grades.length} note(s)</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Périodes et trimestres restent des vues distinctes. */}
      <Tabs value={trimester} onValueChange={setTrimester}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 xl:grid-cols-7">
          {gradeViews.map((view) => (
            <TabsTrigger key={view.key} value={view.key} className="min-h-10 whitespace-normal px-2 py-2 text-xs leading-tight sm:text-sm">
              <BarChart3 className="mr-1.5 h-4 w-4 shrink-0" />{view.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={trimester} className="mt-4">
          {grades.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-4"><BarChart3 className="h-10 w-10 text-muted-foreground/50" /></div>
              <h3 className="text-lg font-semibold mb-1">Aucune note</h3>
              <p className="text-muted-foreground">Aucune note enregistrée pour {selectedGradeView.title.toLowerCase()}.</p>
            </div>
          ) : (
            <Card className="shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="hidden md:block overflow-x-auto">
                  <Table className="text-sm min-w-[600px]">
                    <TableHeader className="sticky top-0 bg-muted/50 backdrop-blur z-10">
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="pl-6">Cours</TableHead>
                        <TableHead className="text-center">Note</TableHead>
                        <TableHead className="text-center">Note max</TableHead>
                        <TableHead className="text-center">Moyenne</TableHead>
                        <TableHead className="hidden sm:table-cell">Commentaire/Appréciation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="[&>tr:nth-child(even)]:bg-muted/30">
                      {groupedByCourse.map((entry) => {
                        const pct = Math.round((entry.average / 20) * 100);
                        return (
                          <TableRow key={entry.courseId} className="hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors">
                            <TableCell className="pl-6 font-medium">
                              {entry.courseName}
                              <span className="block text-[10px] text-muted-foreground font-normal mt-0.5">
                                Coef. {entry.coeff} · {entry.grades.length} note(s)
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-wrap justify-center gap-1">
                                {entry.grades.map((g) => (
                                  <div key={g.id} className="inline-flex flex-col items-center gap-0.5">
                                    <span
                                      title={`${trimesterLabels[g.trimester] || g.trimester} : ${g.score}/${g.maxScore}`}
                                      className={`inline-flex items-center justify-center rounded-lg px-2 py-1 text-xs font-bold ${getGradeBg(g.score, g.maxScore)}`}
                                    >
                                      {g.score}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground">
                              <div className="flex flex-wrap justify-center gap-1">
                                {entry.grades.map((g) => (
                                  <span key={g.id} className="inline-flex items-center justify-center rounded-lg px-2 py-1 text-xs font-bold bg-muted">
                                    /{g.maxScore}
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-1.5">
                                <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${getProgressColor(entry.average, 20)}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs text-muted-foreground">{entry.average.toFixed(1)}/20 ({pct}%)</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell max-w-[200px] truncate text-muted-foreground text-sm">
                              {entry.grades.map((g) => g.comment).filter(Boolean).join(' · ') || '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Average Row */}
                      <TableRow className="bg-gradient-to-r from-blue-50 to-indigo-50 font-bold">
                        <TableCell className="pl-6 text-blue-700">Moyenne</TableCell>
                        <TableCell colSpan={2}></TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-sm">{average.toFixed(2)}/20</Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell"></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                {/* Vue mobile : une carte par cours */}
                <div className="md:hidden divide-y">
                  {groupedByCourse.map((entry) => {
                    const pct = Math.round((entry.average / 20) * 100);
                    return (
                      <div key={entry.courseId} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{entry.courseName}</p>
                            <p className="text-[10px] text-muted-foreground">
                              Coef. {entry.coeff} · {entry.grades.length} note(s)
                            </p>
                          </div>
                          <span className="text-sm font-bold shrink-0">{entry.average.toFixed(1)}/20</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${getProgressColor(entry.average, 20)}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {entry.grades.map((g) => (
                            <div key={g.id} className="flex flex-col items-center gap-0.5">
                              <span
                                title={`${trimesterLabels[g.trimester] || g.trimester} : ${g.score}/${g.maxScore}`}
                                className={`inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-xs font-bold ${getGradeBg(g.score, g.maxScore)}`}
                              >
                                {g.score}/{g.maxScore}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between">
                    <span className="text-sm font-bold text-blue-700">Moyenne générale</span>
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-sm">{average.toFixed(2)}/20</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
