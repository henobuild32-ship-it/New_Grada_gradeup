'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, School } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useEntityListState } from '@/lib/offline/hooks';
import type { CourseRecord } from '@/lib/offline/db';
import WeeklyScheduleView from './weekly-schedule-view';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface ClassItem {
  id: string;
  name: string;
  level: string;
}

function extractCourses(data: unknown): Record<string, unknown>[] {
  if (typeof data !== 'object' || data === null || !('courses' in data)) return [];
  const courses = (data as { courses?: unknown }).courses;
  return Array.isArray(courses)
    ? courses.filter((course): course is Record<string, unknown> => typeof course === 'object' && course !== null)
    : [];
}

export default function SchedulesPage() {
  const user = useAppStore((state) => state.user);
  const [selectedClassId, setSelectedClassId] = useState('');
  const coursesState = useEntityListState<CourseRecord>('courses', user?.schoolId, {
    remoteUrl: user?.role === 'TEACHER' && user.id
      ? `/api/courses?schoolId=${encodeURIComponent(user.schoolId)}&teacherId=${encodeURIComponent(user.id)}`
      : undefined,
    extract: extractCourses,
  });
  const teacherClasses = useMemo(() => {
    if (!user || user.role !== 'TEACHER') return [];
    const classMap = new Map<string, ClassItem>();
    for (const course of coursesState.data) {
      if (course.teacherId !== user.id || !course.classId || classMap.has(course.classId)) continue;
      const item = course as CourseRecord & { class?: { name?: string; level?: string } };
      classMap.set(course.classId, {
        id: course.classId,
        name: item.class?.name || 'Classe inconnue',
        level: item.class?.level || '',
      });
    }
    return Array.from(classMap.values());
  }, [coursesState.data, user]);

  if (!user) return null;

  if (user.role === 'TEACHER') {
    const activeClass = teacherClasses.find((cls) => cls.id === selectedClassId) ?? teacherClasses[0];

    return (
      <div className="animate-fade-in space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold">Emploi du temps</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Consultez les horaires des classes auxquelles vos cours sont rattachés.
            </p>
          </div>
          {teacherClasses.length > 1 && (
            <div className="w-full max-w-xs">
              <Select value={activeClass?.id ?? ''} onValueChange={setSelectedClassId}>
                <SelectTrigger className="h-11 gap-2">
                  <School className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="Choisir une classe" />
                </SelectTrigger>
                <SelectContent>
                  {teacherClasses.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>{cls.name} — {cls.level}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {coursesState.loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : teacherClasses.length === 0 && coursesState.error ? (
          <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
            <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
              <AlertTriangle className="h-9 w-9 text-amber-500" />
              <div>
                <h2 className="text-lg font-semibold">Classes indisponibles</h2>
                <p className="mt-1 text-sm text-muted-foreground">{coursesState.error}</p>
              </div>
              <button
                type="button"
                onClick={() => void coursesState.refresh()}
                disabled={coursesState.refreshing}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${coursesState.refreshing ? 'animate-spin' : ''}`} />
                Réessayer
              </button>
            </CardContent>
          </Card>
        ) : teacherClasses.length === 0 ? (
          <Card className="border-2 border-dashed border-muted/50">
            <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
              <AlertTriangle className="h-10 w-10 text-amber-500" />
              <div>
                <h2 className="text-lg font-semibold">Aucun cours assigné</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vous n&apos;avez aucun cours assigné. Contactez l&apos;administrateur pour configurer vos cours.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : activeClass ? (
          <>
            {coursesState.error && (
              <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                {coursesState.error} Les classes enregistrées hors ligne restent disponibles.
              </p>
            )}
            <WeeklyScheduleView schoolId={user.schoolId} classId={activeClass.id} classNameLabel={activeClass.name} />
          </>
        ) : null}
      </div>
    );
  }

  const classes = user.classEnrollments?.map((enrollment) => enrollment.class) || [];
  const activeClassId = selectedClassId && classes.some((cls) => cls.id === selectedClassId)
    ? selectedClassId
    : classes[0]?.id || '';
  const selectedClass = classes.find((cls) => cls.id === activeClassId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Emploi du temps</h1>
          <p className="text-sm text-muted-foreground">Consultez les horaires publiés pour votre classe.</p>
        </div>
        {classes.length > 1 && (
          <div className="w-full max-w-sm">
            <Select value={activeClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Choisir une classe" /></SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>{cls.name} ({cls.level})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {classes.length === 0 ? (
        <Card className="border-2 border-dashed border-muted/50">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <AlertTriangle className="h-10 w-10 text-blue-500" />
            <div>
              <h2 className="text-lg font-semibold">Aucune classe assignée</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Aucun emploi du temps n&apos;a encore été attribué à votre profil. Contactez l&apos;administrateur.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : selectedClass ? (
        <WeeklyScheduleView schoolId={user.schoolId} classId={selectedClass.id} classNameLabel={selectedClass.name} />
      ) : null}
    </div>
  );
}
