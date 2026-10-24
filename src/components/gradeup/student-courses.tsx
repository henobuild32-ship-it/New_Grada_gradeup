'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import type { CourseInfo, LessonInfo } from '@/lib/types';
import type { LocalRecord } from '@/lib/offline/types';
import { useEntityListState } from '@/lib/offline/hooks';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ErrorState } from '@/components/ui/error-state';
import { BookOpen, User, GraduationCap, FileText, ChevronLeft, BookOpenCheck, RefreshCw } from 'lucide-react';

type LocalCourse = CourseInfo & LocalRecord;
type LocalLesson = LessonInfo & LocalRecord;

function extractCourses(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== 'object') return [];
  const courses = (data as { courses?: unknown }).courses;
  return Array.isArray(courses) ? courses as Record<string, unknown>[] : [];
}

function extractLessons(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== 'object') return [];
  const lessons = (data as { lessons?: unknown }).lessons;
  return Array.isArray(lessons) ? lessons as Record<string, unknown>[] : [];
}

export default function StudentCourses() {
  const user = useAppStore((s) => s.user);
  const [selectedCourse, setSelectedCourse] = useState<CourseInfo | null>(null);
  const classId = user?.classEnrollments?.[0]?.classId;
  const courseFilter = useCallback(
    (record: LocalRecord) => (record as LocalCourse).classId === classId,
    [classId]
  );
  const courseQuery = classId && user?.schoolId
    ? new URLSearchParams({ schoolId: user.schoolId, classId }).toString()
    : null;
  const { data: cachedCourses, loading, refreshing: refreshingCourses, error: courseError, refresh: refreshCourses } = useEntityListState<LocalCourse>(
    'courses',
    user?.schoolId,
    {
      remoteUrl: courseQuery ? `/api/courses?${courseQuery}` : undefined,
      extract: extractCourses,
      filter: courseFilter,
    }
  );
  const courses = cachedCourses;
  const selectedCourseId = selectedCourse?.id;
  const lessonFilter = useCallback(
    (record: LocalRecord) => (record as LocalLesson).courseId === selectedCourseId,
    [selectedCourseId]
  );
  const lessonQuery = selectedCourseId && user?.schoolId
    ? new URLSearchParams({ schoolId: user.schoolId, courseId: selectedCourseId }).toString()
    : null;
  const { data: cachedLessons, loading: loadingLessons, refreshing: refreshingLessons, error: lessonError, refresh: refreshLessons } = useEntityListState<LocalLesson>(
    'lessons',
    user?.schoolId,
    {
      remoteUrl: lessonQuery ? `/api/lessons?${lessonQuery}` : undefined,
      extract: extractLessons,
      filter: lessonFilter,
    }
  );
  const lessons = useMemo(
    () => [...cachedLessons].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [cachedLessons]
  );
  const refreshing = refreshingCourses || refreshingLessons;
  const refreshAll = () => { void Promise.all([refreshCourses(), refreshLessons()]); };
  const handleViewCourse = (course: CourseInfo) => { setSelectedCourse(course); };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (courseError && courses.length === 0) {
    return <ErrorState title="Cours indisponibles" description={courseError} onRetry={refreshAll} />;
  }

  if (selectedCourse) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => setSelectedCourse(null)} className="min-h-11 gap-1 text-blue-600 hover:text-blue-700">
            <ChevronLeft className="h-4 w-4" />Retour aux cours
          </Button>
          <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={refreshAll} disabled={refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} /> Actualiser
          </Button>
        </div>

        <Card className="shadow-sm border-blue-100">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">{selectedCourse.name}</CardTitle>
                <CardDescription className="mt-1">{selectedCourse.teacher?.fullName || 'Enseignant non assigné'}</CardDescription>
              </div>
              <Badge className="bg-blue-600 text-white">{selectedCourse.class?.name}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {selectedCourse.description && <p className="text-sm text-muted-foreground mb-4">{selectedCourse.description}</p>}
            <div className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-blue-500" /><span className="font-medium text-blue-600">{lessons.length}</span><span className="text-muted-foreground">leçon(s) disponible(s)</span></div>
          </CardContent>
        </Card>

        <div>
          <h3 className="text-lg font-semibold mb-3">Leçons du cours</h3>
          {loadingLessons ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
          ) : lessonError && lessons.length === 0 ? (
            <ErrorState title="Leçons indisponibles" description={lessonError} onRetry={refreshAll} />
          ) : lessons.length === 0 ? (
            <div className="text-center py-16">
              <div className="mx-auto w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-4"><FileText className="h-10 w-10 text-muted-foreground/50" /></div>
              <h3 className="text-lg font-semibold mb-1">Aucune leçon disponible</h3>
              <p className="text-muted-foreground">Votre enseignant n&apos;a pas encore publié de leçons pour ce cours.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              <div className="space-y-3">
                {lessons.map((lesson) => (
                  <Card key={lesson.id} className="hover:shadow-md transition-all border hover:border-blue-200">
                    <CardContent className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600"><FileText className="h-5 w-5" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{lesson.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">{lesson.content.length > 100 ? lesson.content.substring(0, 100) + '...' : lesson.content}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">{formatDate(lesson.createdAt)}</Badge>
                          {lesson.fileUrl && <Badge variant="outline" className="text-xs">📎 Pièce jointe</Badge>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="mb-6 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mes cours</h1>
            <p className="text-sm text-muted-foreground mt-1">{courses.length} cours dans votre classe</p>
          </div>
          <Button type="button" variant="outline" className="min-h-11 self-start gap-2" onClick={refreshAll} disabled={refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} /> Actualiser
          </Button>
        </div>
      </div>

      {courseError && courses.length > 0 && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          Affichage des données enregistrées sur cet appareil. {courseError}
        </div>
      )}

      {courses.length === 0 ? (
        <div className="text-center py-20">
          <div className="mx-auto w-24 h-24 rounded-full bg-muted/50 flex items-center justify-center mb-4"><BookOpen className="h-12 w-12 text-muted-foreground/50" /></div>
          <h3 className="text-xl font-semibold mb-2">Aucun cours disponible</h3>
          <p className="text-muted-foreground">Vous n&apos;êtes inscrit à aucun cours pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => (
            <Card key={course.id} className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.01] border hover:border-blue-200" onClick={() => handleViewCourse(course)}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600 shadow-sm"><BookOpen className="h-5 w-5" /></div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">{course.class?.name}</Badge>
                </div>
                <CardTitle className="mt-3 text-lg">{course.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><User className="h-4 w-4" /><span>{course.teacher?.fullName || '—'}</span></div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><GraduationCap className="h-4 w-4" /><span>{course.class?.name}</span></div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><BookOpenCheck className="h-4 w-4" /><span>{course._count?.lessons || 0} leçon(s)</span></div>
                </div>
                {course.description && <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{course.description}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
