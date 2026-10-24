'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import type { CourseInfo, LessonInfo } from '@/lib/types';
import type { LocalRecord } from '@/lib/offline/types';
import { useEntityListState } from '@/lib/offline/hooks';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { BookOpen, User, Clock, FileText, ChevronDown, ChevronUp, Download, Filter, RefreshCw } from 'lucide-react';

type LocalCourse = CourseInfo & LocalRecord;
type LocalLesson = LessonInfo & LocalRecord;
interface PublishedDocument {
  id: string;
  title: string;
  subject?: string;
  content?: string;
  description?: string;
  category?: string;
  fileUrl?: string;
  fileName?: string;
  targetClassId?: string;
  updatedAt: string;
}

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

export default function StudentLessons() {
  const user = useAppStore((s) => s.user);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDocumentId, setExpandedDocumentId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<PublishedDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [documentsError, setDocumentsError] = useState('');

  const classIds = useMemo(() => new Set((user?.classEnrollments || []).map((item) => item.classId)), [user?.classEnrollments]);
  const courseFilter = useCallback(
    (record: LocalRecord) => classIds.has((record as LocalCourse).classId),
    [classIds]
  );
  const courseQuery = classIds.size > 0 && user?.schoolId
    ? new URLSearchParams({ schoolId: user.schoolId }).toString()
    : null;
  const { data: cachedCourses, loading: loadingCourses, error: courseError, refresh: refreshCourses } = useEntityListState<LocalCourse>(
    'courses',
    user?.schoolId,
    {
      remoteUrl: courseQuery ? `/api/courses?${courseQuery}` : undefined,
      extract: extractCourses,
      filter: courseFilter,
    }
  );
  const courses = cachedCourses;
  const courseIds = useMemo(() => new Set(courses.map((course) => course.id)), [courses]);
  const lessonFilter = useCallback(
    (record: LocalRecord) => {
      const lesson = record as LocalLesson;
      return courseIds.has(lesson.courseId) && (selectedCourseId === 'all' || lesson.courseId === selectedCourseId);
    },
    [courseIds, selectedCourseId]
  );
  const lessonQuery = classIds.size > 0 && user?.schoolId
    ? new URLSearchParams({ schoolId: user.schoolId, ...(selectedCourseId !== 'all' ? { courseId: selectedCourseId } : {}) }).toString()
    : null;
  const { data: cachedLessons, loading: loadingLessons, refreshing, error: lessonError, refresh: refreshLessons } = useEntityListState<LocalLesson>(
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
  const visibleDocuments = useMemo(() => {
    const classScoped = documents.filter((document) => !document.targetClassId || classIds.has(document.targetClassId));
    if (selectedCourseId === 'all') return classScoped;
    const selectedCourse = courses.find((course) => course.id === selectedCourseId);
    return classScoped.filter((document) => !document.subject || document.subject === selectedCourse?.name);
  }, [documents, classIds, selectedCourseId, courses]);
  const loadDocuments = useCallback(async () => {
    if (!user?.schoolId || !classIds.size) { setDocuments([]); return; }
    setLoadingDocuments(true);
    setDocumentsError('');
    try {
      const response = await fetch(`/api/documents?schoolId=${encodeURIComponent(user.schoolId)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Documents indisponibles.');
      setDocuments(Array.isArray(payload.documents) ? payload.documents : []);
    } catch (error) {
      setDocumentsError(error instanceof Error ? error.message : 'Erreur de chargement des documents.');
    } finally { setLoadingDocuments(false); }
  }, [user?.schoolId, classIds]);
  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  const loading = loadingCourses || loadingLessons || loadingDocuments;
  const loadError = courseError || lessonError || documentsError;
  const refreshAll = () => { void Promise.all([refreshCourses(), refreshLessons(), loadDocuments()]); };

  const toggleExpand = (id: string) => { setExpandedId(expandedId === id ? null : id); };
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-24 rounded-xl" />
        <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      </div>
    );
  }

  if (loadError && courses.length === 0 && lessons.length === 0) {
    return <ErrorState title="Leçons indisponibles" description={loadError} onRetry={refreshAll} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="mb-6 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mes leçons</h1>
            <p className="text-sm text-muted-foreground mt-1">{lessons.length} leçon(s) et {visibleDocuments.length} document(s) disponible(s)</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="button" variant="outline" className="min-h-11 self-start gap-2" onClick={refreshAll} disabled={refreshing}>
              <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} /> Actualiser
            </Button>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger className="w-52 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"><SelectValue placeholder="Tous les cours" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les cours</SelectItem>
                  {courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {loadError && (courses.length > 0 || lessons.length > 0) && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          Affichage des données enregistrées sur cet appareil. {loadError}
        </div>
      )}

      {loadingLessons ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : lessons.length === 0 && visibleDocuments.length === 0 ? (
        <div className="text-center py-20">
          <div className="mx-auto w-24 h-24 rounded-full bg-muted/50 flex items-center justify-center mb-4"><BookOpen className="h-12 w-12 text-muted-foreground/50" /></div>
          <h3 className="text-xl font-semibold mb-2">Aucune leçon disponible</h3>
          <p className="text-muted-foreground">{selectedCourseId !== 'all' ? 'Aucune leçon pour ce cours.' : 'Vos enseignants n\'ont pas encore publié de leçons.'}</p>
        </div>
      ) : lessons.length > 0 ? (
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-4">
            {lessons.map((lesson) => {
              const isExpanded = expandedId === lesson.id;
              return (
                <Card key={lesson.id} className="overflow-hidden hover:shadow-md transition-all border hover:border-blue-200">
                  <CardContent className="p-0">
                    <div className="flex">
                      <div className="flex flex-col items-center py-4 px-4 border-r bg-blue-50/50">
                        <div className="h-3 w-3 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
                        <div className="flex-1 w-px bg-blue-200/50 mt-1" />
                      </div>
                      <div className="flex-1 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="secondary" className="text-xs shrink-0 bg-blue-50 text-blue-700">{lesson.course?.name || 'Cours'}</Badge>
                              {lesson.course?.class?.name && <Badge variant="outline" className="text-xs shrink-0">{lesson.course.class.name}</Badge>}
                            </div>
                            <h3 className="font-semibold text-base">{lesson.title}</h3>
                            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1"><User className="h-3.5 w-3.5" /><span>{lesson.teacher?.fullName || '—'}</span></div>
                              <div className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /><span>{formatDate(lesson.createdAt)}</span></div>
                            </div>
                          </div>
                        </div>
                        {lesson.fileUrl && (
                          <div className="mt-3">
                            <a
                              href={lesson.fileUrl}
                              download={lesson.fileName || true}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                            >
                              <Download className="h-4 w-4" />{lesson.fileName || 'Télécharger le fichier'}
                            </a>
                          </div>
                        )}
                        <div className="mt-3">
                              <Button variant="outline" size="sm" onClick={() => toggleExpand(lesson.id)} className="mt-2 min-h-10 border-blue-200 text-blue-700 hover:bg-blue-50">
                            {isExpanded ? (<><ChevronUp className="h-4 w-4 mr-1" />Fermer</>) : (<><ChevronDown className="h-4 w-4 mr-1" />Ouvrir</>)}
                          </Button>
                        </div>
                        {isExpanded && (
                          <div className="mt-3 p-4 rounded-lg bg-muted/50 border border-muted/50 text-sm leading-relaxed [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-primary [&_a]:underline">
                            {lesson.content ? <ReactMarkdown>{lesson.content}</ReactMarkdown> : 'Aucun contenu disponible.'}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      ) : null}

      {visibleDocuments.length > 0 && (
        <section className="space-y-3" aria-labelledby="student-published-documents">
          <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-indigo-600" /><h2 id="student-published-documents" className="text-lg font-semibold">Documents publiés pour mes classes</h2></div>
          {visibleDocuments.map((document) => {
            const expanded = expandedDocumentId === document.id;
            return (
              <Card key={document.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="text-base">{document.title}</CardTitle>
                      <CardDescription>{document.subject || document.category || 'Document pédagogique'} · {formatDate(document.updatedAt)}</CardDescription>
                    </div>
                    <Button variant="outline" className="min-h-10 shrink-0 gap-2" onClick={() => setExpandedDocumentId(expanded ? null : document.id)}>
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{expanded ? 'Fermer' : 'Ouvrir'}
                    </Button>
                  </div>
                </CardHeader>
                {expanded && (
                  <CardContent className="space-y-3 pt-0">
                    {(document.content || document.description) && <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6"><ReactMarkdown>{document.content || document.description || ''}</ReactMarkdown></div>}
                    {document.fileUrl && <a href={document.fileUrl} download={document.fileName || true} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-blue-700 underline"><Download className="h-4 w-4" />{document.fileName || 'Ouvrir ou télécharger le document'}</a>}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
