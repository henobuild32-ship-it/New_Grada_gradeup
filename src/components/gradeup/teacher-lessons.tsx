'use client';

import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, FileText, Trash2, AlertTriangle, Upload, BookOpen, Download, Eye, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import type { CourseInfo, LessonInfo } from '@/lib/types';
import ReactMarkdown from 'react-markdown';

export default function TeacherLessons() {
  const { user } = useAppStore();
  const [lessons, setLessons] = useState<LessonInfo[]>([]);
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);

  const [formClassId, setFormClassId] = useState('');
  const [formCourseId, setFormCourseId] = useState('');
  const [formPublicationType, setFormPublicationType] = useState<'LESSON' | 'HOMEWORK' | 'DOCUMENT'>('LESSON');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formFileName, setFormFileName] = useState('');
  const [formFileUrl, setFormFileUrl] = useState('');
  const formFileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    if (!user) return;
    setDraftReady(false);
    try {
      const stored = localStorage.getItem(`gradeup:teacher-lesson-draft:${user.schoolId}:${user.id}`);
      if (stored) {
        const draft = JSON.parse(stored) as { classId?: string; courseId?: string; publicationType?: 'LESSON' | 'HOMEWORK' | 'DOCUMENT'; title?: string; content?: string; dueDate?: string; savedAt?: number };
        setFormClassId(typeof draft.classId === 'string' ? draft.classId : '');
        setFormCourseId(typeof draft.courseId === 'string' ? draft.courseId : '');
        setFormPublicationType(draft.publicationType === 'HOMEWORK' || draft.publicationType === 'DOCUMENT' ? draft.publicationType : 'LESSON');
        setFormTitle(typeof draft.title === 'string' ? draft.title : '');
        setFormContent(typeof draft.content === 'string' ? draft.content : '');
        setFormDueDate(typeof draft.dueDate === 'string' ? draft.dueDate : '');
        setDraftSavedAt(typeof draft.savedAt === 'number' ? draft.savedAt : null);
      } else {
        setFormClassId('');
        setFormCourseId('');
        setFormPublicationType('LESSON');
        setFormTitle('');
        setFormContent('');
        setFormDueDate('');
        setDraftSavedAt(null);
      }
    } catch {
      localStorage.removeItem(`gradeup:teacher-lesson-draft:${user.schoolId}:${user.id}`);
    }
    setDraftReady(true);
    fetchData();
  }, [user]);

  useEffect(() => {
    if (!user || !draftReady) return;
    const timer = window.setTimeout(() => {
      if (!formTitle.trim() && !formContent.trim() && !formCourseId) return;
      const savedAt = Date.now();
      localStorage.setItem(`gradeup:teacher-lesson-draft:${user.schoolId}:${user.id}`, JSON.stringify({
        classId: formClassId,
        courseId: formCourseId,
        publicationType: formPublicationType,
        title: formTitle,
        content: formContent,
        dueDate: formDueDate,
        savedAt,
      }));
      setDraftSavedAt(savedAt);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [user, draftReady, formClassId, formCourseId, formPublicationType, formTitle, formContent, formDueDate]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [lessonsRes, coursesRes] = await Promise.all([
        fetch(`/api/lessons?schoolId=${user.schoolId}&teacherId=${user.id}`),
        fetch(`/api/courses?schoolId=${user.schoolId}&teacherId=${user.id}`),
      ]);
      const lessonsData = await lessonsRes.json();
      const coursesData = await coursesRes.json();
      setLessons(Array.isArray(lessonsData) ? lessonsData : (Array.isArray(lessonsData.lessons) ? lessonsData.lessons : []));
      setCourses(Array.isArray(coursesData.courses) ? coursesData.courses : []);

    } catch {
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const todayLessons = Array.isArray(lessons) ? lessons.filter((l) => l.createdAt?.startsWith(today)) : [];
  const classMap = new Map<string, { id: string; name: string }>();
  for (const course of courses) {
    if (course.classId && course.class?.name) classMap.set(course.classId, { id: course.classId, name: course.class.name });
  }
  const assignedClasses = [...classMap.values()];
  const classCourses = courses.filter((course) => course.classId === formClassId);
  const selectedCourse = courses.find((course) => course.id === formCourseId);

  useEffect(() => {
    if (!formCourseId || courses.length === 0) return;
    const current = courses.find((course) => course.id === formCourseId);
    if (current && !formClassId) setFormClassId(current.classId);
    else if (current && current.classId !== formClassId) setFormCourseId('');
  }, [courses, formCourseId, formClassId]);

  const resetForm = () => {
    setFormClassId('');
    setFormCourseId('');
    setFormPublicationType('LESSON');
    setFormTitle('');
    setFormContent('');
    setFormDueDate('');
    setFormFileName('');
    setFormFileUrl('');
    formFileRef.current = null;
    setPreview(false);
  };

  const handleCreate = async () => {
    if (!user || !formClassId || !formCourseId || !formTitle.trim()) {
      toast.error('Sélectionnez d’abord une classe, une matière et un titre.');
      return;
    }
    if (formContent.length > 1000) {
      toast.error('Le contenu est limité à 1 000 caractères.');
      return;
    }

    setSubmitting(true);
    try {
      if (!navigator.onLine) {
        toast.error('La publication exige une connexion. Votre brouillon reste enregistré sur cet appareil.');
        return;
      }
      let fileUrl = formFileUrl.trim();
      if (formFileRef.current) {
        const uploadFormData = new FormData();
        uploadFormData.append('file', formFileRef.current);
        const uploadRes = await fetch('/api/resources/upload', { method: 'POST', body: uploadFormData });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          fileUrl = uploadData.url;
        } else {
          toast.error('Erreur lors de l\'upload du fichier');
          setSubmitting(false);
          return;
        }
      }

      const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      };
      let res: Response;
      if (formPublicationType === 'LESSON') {
        res = await fetch('/api/lessons', {
          ...requestOptions,
          body: JSON.stringify({ schoolId: user.schoolId, courseId: formCourseId, teacherId: user.id, title: formTitle.trim(), content: formContent.trim(), fileUrl, fileName: formFileName.trim(), isPublished: true }),
        });
      } else if (formPublicationType === 'HOMEWORK') {
        res = await fetch('/api/homework', {
          ...requestOptions,
          body: JSON.stringify({ courseId: formCourseId, teacherId: user.id, title: formTitle.trim(), description: formContent.trim(), dueDate: formDueDate, fileUrl, fileName: formFileName.trim(), gradingType: 'manual' }),
        });
      } else {
        const created = await fetch('/api/documents', {
          ...requestOptions,
          body: JSON.stringify({ schoolId: user.schoolId, targetClassId: formClassId, title: formTitle.trim(), description: formContent.trim(), subject: courses.find((course) => course.id === formCourseId)?.name || '', content: formContent.trim(), fileUrl, fileName: formFileName.trim(), category: 'Pédagogique' }),
        });
        if (!created.ok) {
          const err = await created.json();
          toast.error(err.error || 'Erreur lors de la création du document');
          return;
        }
        const createdData = await created.json();
        res = await fetch(`/api/documents?id=${encodeURIComponent(createdData.document.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ published: true }),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Erreur lors de la publication');
        return;
      }

      const publicationLabel = formPublicationType === 'HOMEWORK' ? 'Devoir' : formPublicationType === 'DOCUMENT' ? 'Document' : 'Leçon';
      toast.success(`${publicationLabel} publié avec succès pour la classe sélectionnée.`);
      localStorage.removeItem(`gradeup:teacher-lesson-draft:${user.schoolId}:${user.id}`);
      setDraftSavedAt(null);
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch {
      toast.error('Erreur lors de la création');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/lessons/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Erreur lors de la suppression');
        return;
      }
      toast.success('Leçon supprimée');
      fetchData();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const sortedLessons = Array.isArray(lessons) ? [...lessons].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ) : [];

  const getCourseName = (courseId: string) => {
    return courses.find((c) => c.id === courseId)?.name || 'Cours inconnu';
  };

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="mb-6 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Mes Leçons</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Publiez et gérez vos leçons quotidiennes
            </p>
          </div>
          <Button
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 hover:scale-[1.02] active:scale-[0.98] transition-transform gap-2"
            onClick={() => setDialogOpen(true)}
            disabled={courses.length === 0}
          >
            <Plus className="h-4 w-4" />
            Publier une leçon
          </Button>
        </div>
      </div>

      {/* No courses assigned */}
      {!loading && courses.length === 0 && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription>
            Aucun cours ne vous est assigné. Veuillez contacter l&apos;administrateur pour qu&apos;il vous attribue des cours avant de pouvoir publier des leçons.
          </AlertDescription>
        </Alert>
      )}

      {/* Lessons List */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : sortedLessons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium">Aucune leçon publiée</h3>
          <p className="text-sm text-muted-foreground mt-1">Commencez par publier votre première leçon</p>
          <Button
            variant="outline"
            className="mt-4 gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:scale-[1.02] active:scale-[0.98] transition-transform"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Publier votre première leçon
          </Button>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[18px] top-0 bottom-0 w-0.5 bg-blue-100" />
          <ScrollArea className="max-h-[600px]">
            <div className="space-y-4 pl-10 relative">
              {sortedLessons.map((lesson, index) => (
                <div key={lesson.id} className="relative">
                  {/* Timeline dot */}
                  <div className="absolute -left-10 top-4 h-[18px] w-[18px] rounded-full border-4 border-blue-500 bg-white z-10" />
                  <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              <BookOpen className="h-3 w-3 mr-1" />
                              {getCourseName(lesson.courseId)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(lesson.createdAt).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <CardTitle className="text-base">{lesson.title}</CardTitle>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                          onClick={() => handleDelete(lesson.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {lesson.content && (
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {lesson.content}
                        </p>
                      )}
                      {lesson.fileName && (
                        <div className="flex items-center gap-2 mt-2 text-xs">
                          {lesson.fileUrl ? (
                            <a href={lesson.fileUrl} download={lesson.fileName || true} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 hover:underline">
                              <Download className="h-3 w-3" />
                              {lesson.fileName}
                            </a>
                          ) : (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Upload className="h-3 w-3" />
                              {lesson.fileName}
                            </span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Create Lesson Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[600px]">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-t-lg -mx-6 -mt-6 mb-0" />
          <DialogHeader className="pt-2">
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" />
              Publier {formPublicationType === 'HOMEWORK' ? 'un devoir' : formPublicationType === 'DOCUMENT' ? 'un document' : 'une leçon'}
            </DialogTitle>
            <DialogDescription>
              Choisissez la classe puis uniquement une matière qui vous y est attribuée.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {draftSavedAt && (
              <Alert className="border-blue-200 bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  Brouillon enregistré sur cet appareil · {new Date(draftSavedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}. Il sera conservé si vous perdez la connexion.
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label>Classe *</Label>
              <Select value={formClassId} onValueChange={(value) => { setFormClassId(value); setFormCourseId(''); }}>
                <SelectTrigger className="w-full focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 transition-all">
                  <SelectValue placeholder="Sélectionner d’abord une classe" />
                </SelectTrigger>
                <SelectContent>
                  {assignedClasses.map((schoolClass) => (
                    <SelectItem key={schoolClass.id} value={schoolClass.id}>
                      {schoolClass.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Matière *</Label>
              <Select value={formCourseId} onValueChange={setFormCourseId} disabled={!formClassId}>
                <SelectTrigger className="w-full focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 transition-all">
                  <SelectValue placeholder={formClassId ? 'Sélectionner une matière de cette classe' : 'Choisissez une classe pour continuer'} />
                </SelectTrigger>
                <SelectContent>
                  {classCourses.map((course) => <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Type de publication *</Label>
              <Select value={formPublicationType} onValueChange={(value: 'LESSON' | 'HOMEWORK' | 'DOCUMENT') => setFormPublicationType(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LESSON">Leçon</SelectItem>
                  <SelectItem value="HOMEWORK">Devoir</SelectItem>
                  <SelectItem value="DOCUMENT">Document pédagogique</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {preview && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-sm dark:border-blue-900 dark:bg-blue-950/20">
                <p className="font-semibold">{formTitle.trim() || 'Titre de la publication'}</p>
                <p className="mt-1 text-muted-foreground">
                  Classe : {selectedCourse?.class?.name || '—'}
                  {' · '}Matière : {selectedCourse?.name || '—'}
                  {' · '}{formPublicationType === 'HOMEWORK' ? 'Devoir' : formPublicationType === 'DOCUMENT' ? 'Document' : 'Leçon'}
                </p>
                {(formFileName || formFileUrl.trim()) && (
                  <p className="mt-1 break-all text-xs text-blue-700 dark:text-blue-300">
                    Pièce jointe : {formFileName || formFileUrl.trim()}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Titre *</Label>
              <Input
                placeholder={formPublicationType === 'HOMEWORK' ? 'Titre du devoir' : formPublicationType === 'DOCUMENT' ? 'Titre du document' : 'Titre de la leçon'}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 transition-all"
              />
            </div>

            {formPublicationType === 'HOMEWORK' && (
              <div className="space-y-2">
                <Label htmlFor="lesson-homework-due-date">Date limite de remise</Label>
                <Input id="lesson-homework-due-date" type="date" value={formDueDate} onChange={(event) => setFormDueDate(event.target.value)} />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="lesson-markdown-content">Rédiger un contenu</Label>
                <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={() => setPreview((value) => !value)}>
                  {preview ? <><PencilLine className="mr-2 size-4" />Modifier</> : <><Eye className="mr-2 size-4" />Aperçu</>}
                </Button>
              </div>
              {preview ? (
                <div className="min-h-32 max-h-72 overflow-y-auto rounded-md border bg-muted/20 p-4 text-sm leading-6 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-primary [&_a]:underline">
                  {formContent.trim() ? <ReactMarkdown>{formContent}</ReactMarkdown> : <span className="text-muted-foreground">L’aperçu apparaîtra ici.</span>}
                </div>
              ) : (
                <Textarea
                  id="lesson-markdown-content"
                  placeholder="Écrivez la leçon ou les consignes pour vos élèves…"
                  value={formContent}
                  maxLength={1000}
                  onChange={(e) => setFormContent(e.target.value.slice(0, 1000))}
                  rows={7}
                  className="min-h-36 focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 transition-all"
                />
              )}
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Le brouillon est sauvegardé sur cet appareil. La publication reste en ligne uniquement.</span>
                <span className="shrink-0 tabular-nums">{formContent.length}/1 000</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fichier joint (optionnel)</Label>
              {/* Hidden native file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.json,.zip,.jpg,.jpeg,.png,.webp,.gif,.svg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setFormFileName(file.name);
                    formFileRef.current = file;
                  }
                }}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Aucun fichier sélectionné"
                  value={formFileName}
                  readOnly
                  className="focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:border-blue-500 transition-all cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 border-blue-200 text-blue-600 hover:bg-blue-50"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                </Button>
                {formFileName && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-red-500"
                    onClick={() => { setFormFileName(''); setFormFileUrl(''); formFileRef.current = null; if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  >
                    ✕
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Cliquez pour ouvrir le gestionnaire de fichiers
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lesson-external-link">Lien Google Docs ou autre document accessible (optionnel)</Label>
              <Input
                id="lesson-external-link"
                type="url"
                inputMode="url"
                placeholder="https://docs.google.com/document/d/…"
                value={formFileUrl}
                onChange={(event) => setFormFileUrl(event.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">Vérifiez que les élèves de la classe ont l’autorisation d’ouvrir ce lien.</p>
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="hover:scale-[1.02] active:scale-[0.98] transition-transform">
              Annuler
            </Button>
            <Button
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 hover:scale-[1.02] active:scale-[0.98] transition-transform"
              onClick={handleCreate}
              disabled={submitting || !formCourseId || !formTitle.trim()}
            >
              {submitting ? 'Publication...' : 'Publier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
