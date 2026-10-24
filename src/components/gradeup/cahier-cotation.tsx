'use client';

/**
 * CahierCotation
 * ─────────────────────────────────────────────────────────────────────────────
 * Digital RDC Secondary School Gradebook ("Cahier de Cotation").
 * Supports:
 *   1. Automatic class secondary checking (7e EB, 8e EB, 1e-4e Humanités).
 *   2. Enrolled student loading & order tracking.
 *   3. Perfect grid alignments for print (A4 landscape pagination).
 *   4. Dynamic columns (Interro, TP, Exam) with max scores.
 *   5. "Mettre en ordre alphabétique" action.
 *   6. Auto-save & local storage fallback (offline support).
 *   7. Security limits (Owner edits, Titulaire/Admin view/print).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BookOpen,
  Users,
  Plus,
  Trash2,
  ListOrdered,
  Printer,
  RefreshCw,
  Save,
  CheckCircle,
  Wifi,
  WifiOff,
  UserCheck,
  Zap,
  Send,
  AlertCircle,
  Clock,
  Pencil,
  Camera,
  FileUp,
  ScanText,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchJsonWithCache } from '@/lib/offline-sync';
import TitulaireCotation from '@/components/gradeup/titulaire-cotation';

interface Student {
  id: string;
  fullName: string;
  postName: string;
  gender: string;
}

interface Evaluation {
  id: string;
  title: string;
  maxScore: number;
  period: string;
  date: string;
  marks: Array<{ studentId: string; score: number }>;
  transmissions?: Array<{ status: string; notes?: string; sentAt?: string | null; receivedAt?: string | null }>;
  sourceDocumentName?: string;
  ocrConfidence?: number | null;
  schoolYearId?: string | null;
}

interface OcrReviewRow {
  id: string;
  studentId: string;
  sourceName: string;
  suggestedScore: string;
  score: string;
  sourceLine: string;
  confidence: number;
  confirmed: boolean;
}

interface OcrImportResult {
  sourceDocumentPath: string;
  sourceDocumentName: string;
  text: string;
  confidence: number | null;
  provider: string;
  lines: Array<{ text: string; confidence: number }>;
  classId: string;
  courseId: string;
  period: string;
  schoolYearId: string;
  studentRoster: Student[];
}

function normalizeOcrName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

interface ClassInfo {
  id: string;
  name: string;
  level: string;
}

interface CourseInfo {
  id: string;
  name: string;
  teacherId: string;
  teacher: { fullName: string };
}

interface SchoolYearInfo { id: string; year: string; status: string }

export default function CahierCotation() {
  const { user } = useAppStore();

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('P1'); // P1, P2, EX1, P3, P4, EX2
  const [schoolYears, setSchoolYears] = useState<SchoolYearInfo[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState('');

  const [students, setStudents] = useState<Student[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Send to titulaire state
  const [sendingEval, setSendingEval] = useState<string | null>(null);

  // Column creation dialog
  const [addColOpen, setAddColOpen] = useState(false);
  const [colTitle, setColTitle] = useState('');
  const [colMaxScore, setColMaxScore] = useState('20');
  const [addingCol, setAddingCol] = useState(false);

  // Column editing dialog
  const [editColOpen, setEditColOpen] = useState(false);
  const [editingEval, setEditingEval] = useState<Evaluation | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editMaxScore, setEditMaxScore] = useState('20');
  const [editDate, setEditDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Photo/PDF OCR import with explicit per-student confirmation.
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrSaving, setOcrSaving] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrImportResult | null>(null);
  const [ocrRows, setOcrRows] = useState<OcrReviewRow[]>([]);
  const [ocrTitle, setOcrTitle] = useState('');
  const [ocrMaxScore, setOcrMaxScore] = useState('20');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const ocrDraftKey = user?.schoolId && user.id && (ocrResult?.classId || selectedClassId) && (ocrResult?.courseId || selectedCourseId)
    ? `gradeup:cahier-ocr-draft:${user.schoolId}:${user.id}:${ocrResult?.schoolYearId || selectedSchoolYearId}:${ocrResult?.classId || selectedClassId}:${ocrResult?.courseId || selectedCourseId}`
    : null;

  useEffect(() => {
    if (!ocrDraftKey || ocrResult) return;
    try {
      const saved = localStorage.getItem(ocrDraftKey);
      if (!saved) return;
      const draft = JSON.parse(saved) as { result?: OcrImportResult; rows?: OcrReviewRow[]; title?: string; maxScore?: string; period?: string };
      if (!draft.result || !Array.isArray(draft.rows)) return;
      setOcrResult(draft.result);
      setOcrRows(draft.rows.map((row, index) => ({ ...row, id: row.id || `saved-${index}`, sourceName: row.sourceName || '' })));
      setOcrTitle(draft.title || 'Évaluation importée');
      setOcrMaxScore(draft.maxScore || '20');
      if (draft.period) setSelectedPeriod(draft.period);
      if (draft.result.schoolYearId) setSelectedSchoolYearId(draft.result.schoolYearId);
      setOcrOpen(true);
      toast.info('Votre import OCR en brouillon a été repris. Vérifiez les notes avant de les enregistrer.');
    } catch {
      localStorage.removeItem(ocrDraftKey);
    }
  }, [ocrDraftKey, ocrResult]);

  useEffect(() => {
    if (!ocrDraftKey || !ocrResult || !ocrRows.length) return;
    localStorage.setItem(ocrDraftKey, JSON.stringify({ result: ocrResult, rows: ocrRows, title: ocrTitle, maxScore: ocrMaxScore, period: selectedPeriod }));
  }, [ocrDraftKey, ocrResult, ocrRows, ocrTitle, ocrMaxScore, selectedPeriod]);

  // Offline status & unsaved changes
  const [isOnline, setIsOnline] = useState(true);
  const [unsavedChanges, setUnsavedChanges] = useState<Record<string, Record<string, number>>>({}); // { [evalId]: { [studentId]: score } }

  // Sync online/offline event handlers
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(navigator.onLine);
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Connexion rétablie. Synchronisation des notes...');
      syncOfflineChanges();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Mode hors-ligne activé. Les modifications seront enregistrées localement.');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [unsavedChanges]);

  // Load offline data from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('gradeup_cahier_unsaved');
    if (saved) {
      try {
        setUnsavedChanges(JSON.parse(saved));
      } catch {
        // ignore
      }
    }
  }, []);

  // Sync offline changes helper
  const syncOfflineChanges = async () => {
    const saved = localStorage.getItem('gradeup_cahier_unsaved');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      const evalIds = Object.keys(parsed);
      for (const evalId of evalIds) {
        const marks = parsed[evalId];
        await fetch('/api/cahier/evaluations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ evaluationId: evalId, marks }),
        });
      }
      localStorage.removeItem('gradeup_cahier_unsaved');
      setUnsavedChanges({});
      toast.success('Notes synchronisées avec succès.');
      fetchData();
    } catch {
      toast.error('Échec de la synchronisation de certaines notes.');
    }
  };

  // Fetch classes appropriate for secondary level
  useEffect(() => {
    if (!user?.schoolId) return;
    let cancelled = false;
    Promise.all([
      fetchJsonWithCache<{ classes: ClassInfo[] }>(`/api/classes?schoolId=${user.schoolId}`, { classes: [] }),
      fetchJsonWithCache<{ years: SchoolYearInfo[] }>('/api/school-years', { years: [] }),
    ]).then(([classesData, yearsData]) => {
      if (cancelled) return;
      const all = classesData.classes || [];
        // Filter to secondary education classes (RDC Levels: 7e EB, 8e EB, 1-4e Humanités, or Secondaire)
        const secondary = all.filter((c: ClassInfo) => {
          const name = c.name.toLowerCase();
          const lvl = c.level.toLowerCase();
          return (
            lvl === 'secondaire' ||
            name.includes('7e') ||
            name.includes('8e') ||
            name.includes('humanit') ||
            name.includes('eb')
          );
        });
        setClasses(secondary);
        if (secondary.length > 0) {
          setSelectedClassId(secondary[0].id);
        }
        const years = yearsData.years || [];
        setSchoolYears(years);
        const activeYear = years.find((year) => year.status === 'OPEN') || years.find((year) => year.status !== 'CLOSED');
        if (activeYear) setSelectedSchoolYearId(activeYear.id);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.schoolId]);

  // Fetch courses for the selected class (scoped to school and optionally teacher)
  useEffect(() => {
    if (!selectedClassId || !user?.schoolId) {
      setCourses([]);
      setSelectedCourseId('');
      return;
    }
    const teacherParam = user.role === 'TEACHER' ? `&teacherId=${user.id}` : '';
    fetchJsonWithCache(`/api/courses?schoolId=${user.schoolId}&classId=${selectedClassId}${teacherParam}`, { courses: [] })
      .then((d) => {
        const list = Array.isArray(d.courses) ? d.courses : Array.isArray(d) ? d : [];
        setCourses(list);
        if (list.length > 0) {
          // Auto select first course (prefer teacher's own course if available)
          setSelectedCourseId(list[0].id);
        } else {
          setSelectedCourseId('');
        }
      })
      .catch(() => {});
  }, [selectedClassId, user?.schoolId, user?.id, user?.role]);

  // Load students, evaluations & marks
  const fetchData = useCallback(async () => {
    if (!selectedClassId || !selectedCourseId) return;
    setLoading(true);
    try {
      const url = `/api/cahier/evaluations?schoolId=${user?.schoolId}&classId=${selectedClassId}&courseId=${selectedCourseId}&period=${selectedPeriod}${selectedSchoolYearId ? `&schoolYearId=${encodeURIComponent(selectedSchoolYearId)}` : ''}`;
      const data = await fetchJsonWithCache(url, { students: [], evaluations: [] });
      setStudents(data.students || []);
      setEvaluations(data.evaluations || []);
    } catch {
      toast.error('Erreur lors du chargement des évaluations');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, selectedCourseId, selectedPeriod, selectedSchoolYearId, user?.schoolId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sort students alphabetically
  const handleSortStudents = () => {
    const sorted = [...students].sort((a, b) => {
      const nameA = `${a.fullName} ${a.postName}`.toLowerCase();
      const nameB = `${b.fullName} ${b.postName}`.toLowerCase();
      return nameA.localeCompare(nameB, 'fr');
    });
    setStudents(sorted);
    toast.success('Liste des élèves triée par ordre alphabétique');
  };

  // Check editing permissions
  const canEdit = useMemo(() => {
    if (user?.role === 'ADMIN') return true;
    const currentCourse = courses.find((c) => c.id === selectedCourseId);
    if (!currentCourse) return false;
    return currentCourse.teacherId === user?.id;
  }, [user, selectedCourseId, courses]);

  // Handle cell score changes
  const handleScoreChange = (evaluationId: string, studentId: string, value: string) => {
    if (!canEdit) {
      toast.error('Modification refusée : Vous n\'êtes pas le professeur de ce cours.');
      return;
    }

    const score = parseFloat(value) || 0;

    // Update local state immediately for responsiveness
    setEvaluations((prev) =>
      prev.map((e) => {
        if (e.id !== evaluationId) return e;
        const index = e.marks.findIndex((m) => m.studentId === studentId);
        const updatedMarks = [...e.marks];
        if (index > -1) {
          updatedMarks[index] = { ...updatedMarks[index], score };
        } else {
          updatedMarks.push({ studentId, score });
        }
        return { ...e, marks: updatedMarks };
      })
    );

    // Save/buffer change
    const updatedUnsaved = {
      ...unsavedChanges,
      [evaluationId]: {
        ...(unsavedChanges[evaluationId] || {}),
        [studentId]: score,
      },
    };
    setUnsavedChanges(updatedUnsaved);
    localStorage.setItem('gradeup_cahier_unsaved', JSON.stringify(updatedUnsaved));

    // Save to server
    if (isOnline) {
      saveEvaluationMarks(evaluationId, updatedUnsaved[evaluationId]);
    }
  };

  const saveEvaluationMarks = async (evaluationId: string, evalMarks: Record<string, number>) => {
    try {
      const res = await fetch('/api/cahier/evaluations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluationId, marks: evalMarks }),
      });
      if (res.ok) {
        // Clear this evaluation from unsaved state
        const nextUnsaved = { ...unsavedChanges };
        delete nextUnsaved[evaluationId];
        setUnsavedChanges(nextUnsaved);
        localStorage.setItem('gradeup_cahier_unsaved', JSON.stringify(nextUnsaved));
      }
    } catch {
      // Offline fallback already handled
    }
  };

  // Add a new evaluation column
  const handleAddColumn = async () => {
    if (!colTitle.trim()) {
      toast.error('Le titre de l\'évaluation est requis');
      return;
    }
    setAddingCol(true);
    try {
      const res = await fetch('/api/cahier/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: user?.schoolId,
          classId: selectedClassId,
          courseId: selectedCourseId,
          teacherId: user?.id,
          title: colTitle,
          maxScore: parseFloat(colMaxScore) || 20,
          period: selectedPeriod,
        }),
      });
      if (res.ok) {
        toast.success(`Colonne "${colTitle}" ajoutée`);
        setColTitle('');
        setAddColOpen(false);
        fetchData();
      } else {
        throw new Error();
      }
    } catch {
      toast.error('Erreur lors de l\'ajout de la colonne');
    } finally {
      setAddingCol(false);
    }
  };

  // Delete an evaluation column
  const handleDeleteColumn = async (evaluationId: string, title: string) => {
    if (!confirm(`Supprimer la colonne "${title}" et toutes ses notes ?`)) return;
    try {
      const res = await fetch(`/api/cahier/evaluations?evaluationId=${evaluationId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success(`Colonne "${title}" supprimée`);
        fetchData();
      } else {
        throw new Error();
      }
    } catch {
      toast.error('Erreur lors de la suppression de la colonne');
    }
  };

  // Open the edit dialog for an evaluation column
  const openEditColumn = (evaluation: Evaluation) => {
    setEditingEval(evaluation);
    setEditTitle(evaluation.title);
    setEditMaxScore(String(evaluation.maxScore));
    setEditDate(evaluation.date ? evaluation.date.slice(0, 10) : '');
    setEditColOpen(true);
  };

  // Save edited evaluation metadata (title, max score, date)
  const handleEditColumn = async () => {
    if (!editingEval) return;
    if (!editTitle.trim()) {
      toast.error('Le titre de l\'évaluation est requis');
      return;
    }
    const parsedMax = parseFloat(editMaxScore);
    if (isNaN(parsedMax) || parsedMax <= 0) {
      toast.error('Veuillez saisir une note maximale valide');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch('/api/cahier/evaluations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluationId: editingEval.id,
          title: editTitle.trim(),
          maxScore: parsedMax,
          date: editDate || undefined,
        }),
      });
      if (res.ok) {
        toast.success(`Colonne "${editTitle.trim()}" modifiée`);
        setEditColOpen(false);
        setEditingEval(null);
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Erreur lors de la modification de la colonne');
      }
    } catch {
      toast.error('Erreur lors de la modification de la colonne');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleOcrFile = async (file?: File) => {
    if (!file || !selectedClassId || !selectedCourseId || students.length === 0) {
      if (file && students.length === 0) toast.error('Chargez d’abord la liste des élèves de la classe.');
      return;
    }
    setOcrBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('classId', selectedClassId);
      formData.append('courseId', selectedCourseId);
      const response = await fetch('/api/cahier/ocr', { method: 'POST', body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Échec de la reconnaissance OCR.');

      const result = {
        ...(payload as OcrImportResult),
        classId: selectedClassId,
        courseId: selectedCourseId,
        period: selectedPeriod,
        schoolYearId: selectedSchoolYearId,
        studentRoster: students,
      };
      const used = new Set<string>();
      const names = result.studentRoster.map((student) => ({
        student,
        normalized: normalizeOcrName(`${student.fullName} ${student.postName}`),
      }));
      const maxValue = Number(ocrMaxScore) || 20;
      const rows: OcrReviewRow[] = [];

      for (const line of result.lines || []) {
        const numericTokens = [...line.text.matchAll(/(?:^|\D)(\d{1,3}(?:[.,]\d{1,2})?)(?=\D|$)/g)].map((match) => Number(match[1].replace(',', '.')));
        const score = numericTokens.reverse().find((value) => Number.isFinite(value) && value >= 0 && value <= maxValue);
        if (score === undefined) continue;
        const sourceName = line.text.replace(/\d+(?:[.,]\d+)?/g, ' ').replace(/[|:;=+\-_/\\]+/g, ' ').trim();
        const lineName = normalizeOcrName(sourceName);
        const candidates: Array<{ id: string; ratio: number }> = [];
        for (const { student, normalized } of names) {
          if (used.has(student.id)) continue;
          const tokens = normalized.split(' ').filter((token) => token.length > 1);
          const matches = tokens.filter((token) => lineName.includes(token)).length;
          const ratio = tokens.length ? matches / tokens.length : 0;
          if (ratio >= 0.6) candidates.push({ id: student.id, ratio });
        }
        candidates.sort((a, b) => b.ratio - a.ratio);
        const best = candidates[0];
        const uniqueBest = best && (candidates.length === 1 || best.ratio > candidates[1].ratio);
        const studentId = uniqueBest ? best.id : '';
        if (studentId) used.add(studentId);
        rows.push({
          id: crypto.randomUUID(), studentId, sourceName, suggestedScore: String(score), score: String(score),
          sourceLine: line.text, confidence: line.confidence || result.confidence || 0, confirmed: false,
        });
      }

      for (const student of result.studentRoster) {
        if (used.has(student.id)) continue;
        rows.push({ id: crypto.randomUUID(), studentId: student.id, sourceName: '', suggestedScore: '', score: '', sourceLine: '', confidence: 0, confirmed: false });
      }

      setOcrResult(result);
      setOcrTitle(file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Évaluation importée');
      setOcrRows(rows);
      setOcrOpen(true);
      toast.success(result.confidence === null
        ? result.provider === 'pdf-text'
          ? 'Texte PDF extrait. Vérifiez les notes proposées avant l’enregistrement.'
          : 'Document traité par le moteur OCR. Vérifiez chaque association et chaque note avant l’enregistrement.'
        : `Document analysé (${Math.round(result.confidence)} % de confiance moyenne). Vérifiez chaque note avant l’enregistrement.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Échec de l’import OCR.');
    } finally {
      setOcrBusy(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (documentInputRef.current) documentInputRef.current.value = '';
    }
  };

  const handleSaveOcrImport = async () => {
    if (!user || !ocrResult || !ocrTitle.trim()) return;
    const maxScore = Number(ocrMaxScore);
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      toast.error('Saisissez une note maximale valide.');
      return;
    }
    const marks: Record<string, number> = {};
    for (const row of ocrRows) {
      if (!row.confirmed || row.score.trim() === '') continue;
      if (!ocrResult.studentRoster.some((student) => student.id === row.studentId)) {
        toast.error('Associez chaque note validée à un élève officiel de la classe.');
        return;
      }
      if (marks[row.studentId] !== undefined) {
        toast.error('Un élève ne peut recevoir qu’une seule note de cette évaluation. Supprimez la ligne en double.');
        return;
      }
      const score = Number(row.score.replace(',', '.'));
      if (!Number.isFinite(score) || score < 0 || score > maxScore) {
        toast.error(`Chaque note confirmée doit être comprise entre 0 et ${maxScore}.`);
        return;
      }
      marks[row.studentId] = score;
    }
    if (!Object.keys(marks).length) {
      toast.error('Confirmez au moins une note avant de créer l’évaluation.');
      return;
    }

    setOcrSaving(true);
    try {
      const response = await fetch('/api/cahier/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: user.schoolId,
          classId: ocrResult.classId,
          courseId: ocrResult.courseId,
          title: ocrTitle.trim(),
          maxScore,
          period: ocrResult.period,
          schoolYearId: ocrResult.schoolYearId,
          teacherId: user.id,
          marks,
          sourceDocumentPath: ocrResult.sourceDocumentPath,
          sourceDocumentName: ocrResult.sourceDocumentName,
          ocrSourceText: ocrResult.text,
          ocrCorrections: ocrRows.map((row) => ({
            studentId: row.studentId,
            sourceName: row.sourceName,
            sourceLine: row.sourceLine,
            score: row.score,
            confirmed: row.confirmed,
          })),
          ocrConfidence: ocrResult.confidence,
          ocrProvider: ocrResult.provider,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Impossible d’enregistrer l’évaluation.');
      toast.success(`Évaluation enregistrée avec ${Object.keys(marks).length} note(s) validée(s).`);
      if (ocrDraftKey) localStorage.removeItem(ocrDraftKey);
      setOcrOpen(false);
      setOcrResult(null);
      setOcrRows([]);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible d’enregistrer l’évaluation.');
    } finally {
      setOcrSaving(false);
    }
  };

  // Send evaluations to titular professor
  const handleSendToTitulaire = async (courseId: string) => {
    const toSend = evaluations.filter((evaluation) => !['SENT', 'RESENT', 'RECEIVED'].includes(evaluation.transmissions?.[0]?.status || 'DRAFT'));
    if (!courseId || toSend.length === 0) {
      toast.info('Aucune cotation non transmise ou à renvoyer dans cette période.');
      return;
    }

    if (!confirm(`Transmettre ${toSend.length} cahier(s) au professeur titulaire ?`)) return;

    setSendingEval('all');
    try {
      const evaluationIds = toSend.map((e) => e.id);
      const res = await fetch('/api/cahier/transmissions/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluationIds, courseId, teacherId: user?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      if (Array.isArray(data.errors) && data.errors.length) {
        toast.error(`${data.sent || 0} cahier(s) transmis; ${data.errors.length} échec(s). ${data.errors[0]?.error || ''}`);
      } else {
        toast.success('Cotations envoyées au titulaire ✅');
      }
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors de l'envoi";
      toast.error(msg);
    } finally {
      setSendingEval(null);
    }
  };

  // Calculate average out of 20 for a student across all period evaluations
  const getStudentPeriodAverage = (studentId: string) => {
    if (evaluations.length === 0) return 0;
    let sum = 0;
    let count = 0;
    for (const e of evaluations) {
      const mark = e.marks.find((m) => m.studentId === studentId);
      if (!mark) continue;
      const max = e.maxScore > 0 ? e.maxScore : 20;
      sum += (mark.score / max) * 20;
      count++;
    }
    return count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
  };

  // Print function
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fade-in print:bg-white print:p-0">
      <div className="print:hidden"><TitulaireCotation /></div>
      {/* ── Header (hidden in print) ── */}
      <div className="mb-6 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-600 to-cyan-600 text-white p-6 relative overflow-hidden shadow-lg print:hidden">
        <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-6 h-6" />
              <h1 className="text-2xl font-extrabold tracking-tight">
                Cahier de Cotation Numérique (RDC)
              </h1>
            </div>
            <p className="text-sm text-teal-100 max-w-xl">
              Modèle conforme à l'enseignement secondaire RDC. Synchronisation en temps
              réel des notes avec les bulletins mensuels et semestriels.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isOnline ? (
              <Badge className="bg-emerald-700 text-emerald-100 hover:bg-emerald-800 gap-1.5 py-1 px-2.5">
                <Wifi className="w-3.5 h-3.5" /> En ligne
              </Badge>
            ) : (
              <Badge className="bg-amber-600 text-amber-100 hover:bg-amber-700 gap-1.5 py-1 px-2.5">
                <WifiOff className="w-3.5 h-3.5" /> Mode local
              </Badge>
            )}
            <Button
              onClick={handlePrint}
              className="bg-white text-emerald-700 hover:bg-teal-50 font-bold shadow-md gap-2"
            >
              <Printer className="w-4 h-4" /> Imprimer le Cahier
            </Button>
          </div>
        </div>
      </div>

      {/* ── Selection controls (hidden in print) ── */}
      <Card className="shadow-sm border border-border print:hidden">
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="h-9 border border-input rounded-lg px-3 bg-background text-sm font-medium focus:ring-2 focus:ring-emerald-500/20"
            >
              {classes.length === 0 ? (
                <option value="">Aucune classe secondaire</option>
              ) : (
                classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="h-9 border border-input rounded-lg px-3 bg-background text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 max-w-[200px]"
            >
              {courses.length === 0 ? (
                <option value="">Aucun cours</option>
              ) : (
                courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </div>

        {schoolYears.length > 0 && (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <select value={selectedSchoolYearId} onChange={(event) => setSelectedSchoolYearId(event.target.value)} className="h-9 max-w-[190px] rounded-lg border border-input bg-background px-3 text-sm font-medium focus:ring-2 focus:ring-emerald-500/20" aria-label="Année scolaire">
              {schoolYears.map((year) => <option key={year.id} value={year.id}>{year.year}{year.status === 'CLOSED' ? ' · clôturée' : ''}</option>)}
            </select>
          </div>
        )}

          <div className="flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-muted-foreground" />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="h-9 border border-input rounded-lg px-3 bg-background text-sm font-medium focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="P1">1ère Période (P1)</option>
              <option value="P2">2ème Période (P2)</option>
              <option value="EX1">Examen 1er Semestre (EX1)</option>
              <option value="P3">3ème Période (P3)</option>
              <option value="P4">4ème Période (P4)</option>
              <option value="EX2">Examen 2ème Semestre (EX2)</option>
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSortStudents}
            className="gap-1.5"
            disabled={students.length === 0}
          >
            <ListOrdered className="w-3.5 h-3.5" /> Trier A-Z
          </Button>

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={(event) => void handleOcrFile(event.target.files?.[0])}
              />
              <input
                ref={documentInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(event) => void handleOcrFile(event.target.files?.[0])}
              />
              {ocrResult && !ocrOpen && (
                <Button variant="outline" size="sm" onClick={() => setOcrOpen(true)} className="gap-1.5">
                  <ScanText className="w-3.5 h-3.5" /> Reprendre l’import OCR
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => cameraInputRef.current?.click()}
                disabled={!selectedCourseId || students.length === 0 || ocrBusy}
                className="gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" /> Prendre une photo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => documentInputRef.current?.click()}
                disabled={!selectedCourseId || students.length === 0 || ocrBusy}
                className="gap-1.5"
              >
                <FileUp className="w-3.5 h-3.5" /> Importer un cahier de cotation
              </Button>
            </div>
          )}

          {canEdit && (
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSendToTitulaire(selectedCourseId)}
                disabled={!selectedCourseId || !evaluations.some((evaluation) => !['SENT', 'RESENT', 'RECEIVED'].includes(evaluation.transmissions?.[0]?.status || 'DRAFT')) || sendingEval !== null}
                className="gap-1.5"
              >
                {sendingEval !== null ? (
                  <>
                    <span className="animate-spin">⏳</span> Envoi...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Transmettre au titulaire
                  </>
                )}
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                onClick={() => setAddColOpen(true)}
                disabled={!selectedCourseId}
              >
                <Plus className="w-4 h-4" /> Ajouter Évaluation
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Cotation Grid Card ── */}
      <Card className="shadow-md border border-border relative overflow-hidden print:border-none print:shadow-none">
        <CardContent className="p-0 sm:p-6 print:p-0">
          {/* Printable Header Section (visible in print only) */}
          <div className="hidden print:block text-center space-y-2 mb-6">
            <h2 className="text-sm font-bold tracking-widest uppercase">
              République Démocratique du Congo
            </h2>
            <p className="text-xs uppercase font-medium">
              Ministère de l'Enseignement Primaire, Secondaire et Technique (EPST)
            </p>
            <div className="border-b-2 border-double border-foreground py-1" />
            <div className="flex justify-between items-center text-xs mt-3">
              <div>
                <strong>École:</strong> {user?.school?.name || 'École Secondaire RDC'}
              </div>
              <div>
                <strong>Classe:</strong>{' '}
                {classes.find((c) => c.id === selectedClassId)?.name || '—'}
              </div>
              <div>
                <strong>Période:</strong> {selectedPeriod}
              </div>
            </div>
            <div className="flex justify-between items-center text-xs mt-1">
              <div>
                <strong>Cours:</strong>{' '}
                {courses.find((c) => c.id === selectedCourseId)?.name || '—'}
              </div>
              <div>
                <strong>Enseignant:</strong>{' '}
                {courses.find((c) => c.id === selectedCourseId)?.teacher?.fullName ||
                  user?.fullName}
              </div>
              <div>
                <strong>Année Scolaire:</strong>{' '}
                {(() => {
                  const now = new Date();
                  const y = now.getFullYear();
                  const start = now.getMonth() >= 8 ? y : y - 1;
                  return `${start}-${start + 1}`;
                })()}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-10 w-full" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-20">
              <Users className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-muted-foreground">Aucun élève dans cette classe</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Les élèves inscrits à cette classe apparaîtront automatiquement ici.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <Table className="border-collapse border border-foreground print:text-[10px]">
                <TableHeader className="bg-muted/40 print:bg-transparent">
                  <TableRow className="border-b border-foreground">
                    <TableHead className="w-12 text-center font-bold text-foreground border-r border-foreground">
                      N°
                    </TableHead>
                    <TableHead className="w-64 font-bold text-foreground border-r border-foreground">
                      Nom, Postnom & Prénom
                    </TableHead>
                    <TableHead className="w-12 text-center font-bold text-foreground border-r border-foreground">
                      Sexe
                    </TableHead>

                    {/* Dynamic evaluations columns */}
                    {evaluations.map((e) => (
                      <TableHead
                        key={e.id}
                        className="text-center min-w-[80px] border-r border-foreground font-semibold text-foreground p-1"
                      >
                        <div className="flex flex-col items-center justify-between h-14">
                          <span className="text-xs font-bold truncate max-w-[100px]" title={e.title}>{e.title}</span>
                          {(() => {
                            const status = e.transmissions?.[0]?.status || 'DRAFT';
                            const label = status === 'RECEIVED' ? 'Validé' : status === 'REJECTED' ? 'À corriger' : status === 'SENT' || status === 'RESENT' ? 'Transmis' : status === 'PARTIAL' ? 'Partiel' : 'Brouillon';
                            return <Badge variant={status === 'RECEIVED' ? 'secondary' : status === 'REJECTED' ? 'destructive' : 'outline'} className="h-5 px-1.5 text-[9px] print:hidden">{label}</Badge>;
                          })()}
                          {e.transmissions?.[0]?.notes && <span className="max-w-[100px] truncate text-[9px] text-amber-700 print:hidden" title={e.transmissions[0].notes}>{e.transmissions[0].notes}</span>}
                          {e.sourceDocumentName && (
                            <a
                              href={`/api/cahier/original?evaluationId=${encodeURIComponent(e.id)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-blue-700 hover:underline print:hidden"
                              title={`Ouvrir l’original : ${e.sourceDocumentName}`}
                            >
                              <ExternalLink className="h-3 w-3" /> Original
                            </a>
                          )}
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                            /{e.maxScore}
                          </span>
                          {canEdit && (
                            <div className="flex items-center gap-1.5 mt-1 print:hidden">
                              <button
                                onClick={() => openEditColumn(e)}
                                className="text-blue-500 hover:text-blue-700"
                                title="Modifier la colonne"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteColumn(e.id, e.title)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </TableHead>
                    ))}

                    <TableHead className="w-20 text-center font-extrabold text-emerald-700 dark:text-emerald-400">
                      Moyenne /20
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student, idx) => {
                    const avg = getStudentPeriodAverage(student.id);
                    return (
                      <TableRow
                        key={student.id}
                        className="hover:bg-muted/10 transition-colors border-b border-foreground even:bg-muted/5 print:bg-transparent"
                      >
                        <TableCell className="text-center font-bold border-r border-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-semibold border-r border-foreground text-sm uppercase print:text-[10px]">
                          {student.fullName} {student.postName}
                        </TableCell>
                        <TableCell className="text-center font-mono border-r border-foreground">
                          {student.gender}
                        </TableCell>

                        {/* Evaluation inputs */}
                        {evaluations.map((e) => {
                          const mark = e.marks.find((m) => m.studentId === student.id);
                          const scoreVal = mark ? String(mark.score) : '';

                          return (
                            <TableCell
                              key={e.id}
                              className="text-center p-1 border-r border-foreground"
                            >
                              {canEdit ? (
                                <input
                                  type="number"
                                  min="0"
                                  max={e.maxScore}
                                  step="0.5"
                                  value={scoreVal}
                                  onChange={(evt) =>
                                    handleScoreChange(e.id, student.id, evt.target.value)
                                  }
                                  placeholder="—"
                                  className="w-12 h-8 text-center border rounded font-mono font-bold text-sm bg-transparent focus:bg-white focus:text-black focus:ring-1 focus:ring-emerald-500 print:border-none print:w-auto print:text-xs"
                                />
                              ) : (
                                <span className="font-mono font-bold text-sm">
                                  {scoreVal || '—'}
                                </span>
                              )}
                            </TableCell>
                          );
                        })}

                        <TableCell className="text-center">
                          <span
                            className={`inline-flex items-center justify-center font-extrabold text-sm rounded-lg px-2 py-0.5 border ${
                              avg >= 14
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : avg >= 10
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-red-50 text-red-600 border-red-200'
                            } print:border-none print:bg-transparent`}
                          >
                            {avg.toFixed(1)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Column creation Dialog ── */}
      <Dialog open={addColOpen} onOpenChange={setAddColOpen}>
        <DialogContent className="sm:max-w-md">
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 h-2 rounded-t-lg -mx-6 -mt-6 mb-0" />
          <DialogHeader className="pt-2">
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-600" />
              Ajouter une évaluation
            </DialogTitle>
            <DialogDescription>
              Créez une nouvelle colonne d'évaluation pour la période en cours.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="col-title">Titre de l'évaluation</Label>
              <Input
                id="col-title"
                value={colTitle}
                onChange={(e) => setColTitle(e.target.value)}
                placeholder="Ex: Interrogation 1, TP 2"
                className="focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="col-max">Note maximale (Maximum)</Label>
              <Input
                id="col-max"
                type="number"
                min="1"
                value={colMaxScore}
                onChange={(e) => setColMaxScore(e.target.value)}
                placeholder="20"
                className="focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddColOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleAddColumn}
              disabled={addingCol}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {addingCol ? 'Création...' : 'Créer la colonne'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Column editing Dialog ── */}
      <Dialog open={ocrOpen} onOpenChange={(open) => {
        setOcrOpen(open);
      }}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanText className="h-5 w-5 text-emerald-600" /> Vérifier les notes reconnues
            </DialogTitle>
            <DialogDescription>
              L’OCR propose des notes à partir du document. Chaque ligne reste non validée jusqu’à votre confirmation; les valeurs incertaines doivent être corrigées manuellement.
            </DialogDescription>
          </DialogHeader>

          {ocrResult && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ocr-evaluation-title">Titre de l’évaluation</Label>
                  <Input id="ocr-evaluation-title" value={ocrTitle} onChange={(event) => setOcrTitle(event.target.value)} maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ocr-max-score">Note maximale</Label>
                  <Input id="ocr-max-score" type="number" min="1" step="0.5" value={ocrMaxScore} onChange={(event) => setOcrMaxScore(event.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  {ocrResult.sourceDocumentName} · {ocrResult.provider} · {ocrResult.confidence === null ? (ocrResult.provider === 'pdf-text' ? 'Texte PDF natif' : 'Confiance non fournie par le moteur') : `Confiance OCR moyenne : ${Math.round(ocrResult.confidence)} %`} · {classes.find((item) => item.id === ocrResult.classId)?.name} · {courses.find((item) => item.id === ocrResult.courseId)?.name} · {ocrResult.period} · {schoolYears.find((year) => year.id === ocrResult.schoolYearId)?.year}
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Élève officiel</TableHead>
                      <TableHead className="min-w-32">Note / {ocrMaxScore || '—'}</TableHead>
                      <TableHead className="min-w-64">Nom et ligne détectés</TableHead>
                      <TableHead className="w-32 text-center">Confirmation</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ocrRows.map((row) => {
                      const student = ocrResult.studentRoster.find((item) => item.id === row.studentId);
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="min-w-56">
                            <select
                              className="min-h-10 w-full rounded-md border bg-background px-2 text-sm"
                              value={row.studentId}
                              onChange={(event) => setOcrRows((current) => current.map((item) => item.id === row.id ? { ...item, studentId: event.target.value, confirmed: false } : item))}
                              aria-label="Associer cette ligne à un élève officiel"
                            >
                              <option value="">Associer à un élève…</option>
                              {ocrResult.studentRoster.map((item) => <option key={item.id} value={item.id}>{item.fullName} {item.postName}</option>)}
                            </select>
                            {student && <span className="mt-1 block text-xs text-muted-foreground">{student.fullName} {student.postName}</span>}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              max={ocrMaxScore}
                              step="0.01"
                              value={row.score}
                              placeholder="—"
                              onChange={(event) => setOcrRows((current) => current.map((item) => item.id === row.id ? { ...item, score: event.target.value, confirmed: false } : item))}
                              aria-label={`Note de ${student?.fullName || 'l’élève'}`}
                            />
                            {row.suggestedScore !== '' && <span className="mt-1 block text-xs text-muted-foreground">Suggestion : {row.suggestedScore}/{ocrMaxScore}</span>}
                          </TableCell>
                          <TableCell className="max-w-sm text-xs text-muted-foreground">
                            {row.sourceLine ? <>
                              <Input className="mb-2" value={row.sourceName} placeholder="Nom reconnu (corrigeable)" onChange={(event) => setOcrRows((current) => current.map((item) => item.id === row.id ? { ...item, sourceName: event.target.value, confirmed: false } : item))} />
                              <span className="block break-words">{row.sourceLine}</span>
                              {ocrResult.confidence !== null && <span className={row.confidence < 60 ? 'text-amber-700' : ''}>Confiance ligne : {Math.round(row.confidence)} %</span>}
                            </> : <Input value={row.sourceName} placeholder="Nom de l’élève (optionnel)" onChange={(event) => setOcrRows((current) => current.map((item) => item.id === row.id ? { ...item, sourceName: event.target.value } : item))} />}
                          </TableCell>
                          <TableCell className="text-center">
                            <label className="inline-flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={row.confirmed}
                                disabled={!row.studentId || !row.score.trim()}
                                onChange={(event) => setOcrRows((current) => current.map((item) => item.id === row.id ? { ...item, confirmed: event.target.checked } : item))}
                              />
                              Validée
                            </label>
                          </TableCell>
                          <TableCell>
                            <Button type="button" variant="ghost" size="icon" aria-label="Supprimer cette ligne" onClick={() => setOcrRows((current) => current.filter((item) => item.id !== row.id))}>
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <Button type="button" variant="outline" className="gap-2" onClick={() => setOcrRows((current) => [...current, { id: crypto.randomUUID(), studentId: '', sourceName: '', suggestedScore: '', score: '', sourceLine: '', confidence: 0, confirmed: false }])}>
                <Plus className="h-4 w-4" /> Ajouter une ligne manuelle
              </Button>

              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">Afficher le texte brut reconnu</summary>
                <Textarea className="mt-3 min-h-36 font-mono text-xs" readOnly value={ocrResult.text} />
              </details>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setOcrOpen(false)} disabled={ocrSaving}>Garder en brouillon</Button>
            <Button onClick={handleSaveOcrImport} disabled={ocrSaving || !ocrResult || !ocrTitle.trim()} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
              {ocrSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {ocrSaving ? 'Enregistrement…' : 'Enregistrer les notes validées'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editColOpen} onOpenChange={setEditColOpen}>
        <DialogContent className="sm:max-w-md">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-t-lg -mx-6 -mt-6 mb-0" />
          <DialogHeader className="pt-2">
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              Modifier l'évaluation
            </DialogTitle>
            <DialogDescription>
              Modifiez les informations de la colonne. Les notes et bulletins seront
              recalculés automatiquement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Titre de l'évaluation</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Ex: Interrogation 1, TP 2"
                className="focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-max">Note maximale</Label>
                <Input
                  id="edit-max"
                  type="number"
                  min="1"
                  value={editMaxScore}
                  onChange={(e) => setEditMaxScore(e.target.value)}
                  placeholder="20"
                  className="focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-date">Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditColOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleEditColumn}
              disabled={savingEdit || !editTitle.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {savingEdit ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
