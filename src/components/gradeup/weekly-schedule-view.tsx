'use client';

import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useEntityListState } from '@/lib/offline/hooks';
import type { LocalRecord } from '@/lib/offline/types';
import type { ScheduleRecord } from '@/lib/offline/db';
import { AlertTriangle, BookOpen, CalendarDays, Clock, MapPin, RefreshCw, User } from 'lucide-react';

interface WeeklyScheduleViewProps {
  schoolId: string;
  classId: string;
  classNameLabel?: string;
}

const DAYS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractSchedules(data: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.schedules)
      ? data.schedules
      : [];

  return rows.filter(isRecord).map((row) => {
    const course = isRecord(row.course) ? row.course : {};
    const teacher = isRecord(course.teacher) ? course.teacher : {};
    const schoolClass = isRecord(course.class) ? course.class : {};
    return {
      ...row,
      courseId: String(row.courseId ?? course.id ?? ''),
      classId: String(schoolClass.id ?? course.classId ?? ''),
      courseName: String(course.name ?? 'Cours'),
      teacherName: String(teacher.fullName ?? 'Professeur'),
      className: String(schoolClass.name ?? ''),
    };
  });
}

export default function WeeklyScheduleView({ schoolId, classId, classNameLabel }: WeeklyScheduleViewProps) {
  const [activeDay, setActiveDay] = useState<number>(new Date().getDay() || 1);
  const remoteUrl = useMemo(() => {
    if (!schoolId || !classId) return undefined;
    const query = new URLSearchParams({ schoolId, classId });
    return `/api/schedules?${query.toString()}`;
  }, [schoolId, classId]);
  const filterSchedule = useCallback(
    (record: LocalRecord) => (record as ScheduleRecord).classId === classId,
    [classId]
  );
  const { data, loading, refreshing, error, refresh } = useEntityListState<ScheduleRecord>(
    'schedules',
    schoolId,
    { remoteUrl, extract: extractSchedules, filter: filterSchedule }
  );

  const schedules = useMemo(
    () => data.slice().sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)),
    [data]
  );
  const getDaySchedules = (dayNum: number) => schedules.filter((schedule) => schedule.dayOfWeek === dayNum);

  if (loading) {
    return (
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-1 h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border bg-card/60 shadow-md backdrop-blur-xl">
      <CardHeader className="border-b bg-muted/20 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-5 w-5 text-blue-600" />
              Emploi du temps hebdomadaire
            </CardTitle>
            <CardDescription className="text-xs">
              Consultez le planning des cours de la classe {classNameLabel ? `(${classNameLabel})` : ''}
            </CardDescription>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || !remoteUrl}
            aria-label="Actualiser l’emploi du temps"
            title="Actualiser l’emploi du temps"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="scrollbar-none mt-4 flex gap-1.5 overflow-x-auto pb-1">
          {DAYS.map((day) => {
            const isActive = activeDay === day.value;
            const count = getDaySchedules(day.value).length;
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => setActiveDay(day.value)}
                aria-pressed={isActive}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                    : 'border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {day.label}
                {count > 0 && (
                  <span
                    className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                      isActive ? 'bg-white text-blue-700' : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {getDaySchedules(activeDay).length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <BookOpen className="mx-auto mb-2.5 h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">Aucun cours planifié pour ce jour</p>
            {schedules.length === 0 && !error && (
              <p className="mt-1 text-xs">L’emploi du temps apparaîtra ici dès qu’il sera publié.</p>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {getDaySchedules(activeDay).map((slot) => (
              <div
                key={slot.id}
                className="flex items-center gap-3 rounded-2xl border bg-background p-3.5 shadow-sm transition-colors hover:bg-muted/10"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-900/30 dark:bg-blue-950/20">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{slot.courseName}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <User className="h-3 w-3 shrink-0 text-emerald-500" />
                    <span className="truncate">{slot.teacherName}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5 pl-2">
                  <Badge variant="outline" className="flex items-center gap-1 border-blue-200 bg-blue-50/50 text-[10px] font-semibold text-blue-700">
                    <Clock className="h-3 w-3 shrink-0" />
                    {slot.startTime} – {slot.endTime}
                  </Badge>
                  {slot.room && (
                    <span className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      <MapPin className="h-2.5 w-2.5 text-muted-foreground" />
                      {slot.room}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
