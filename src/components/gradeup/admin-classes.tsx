'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Pencil,
  Trash2,
  BookOpen,
  Users,
  GraduationCap,
  Baby,
  School,
  FolderPlus,
  ArrowRightLeft,
  UserCheck,
  DollarSign,
  Search,
  Check,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

interface ClassItem {
  id: string;
  name: string;
  level: string;
  cycle?: string;
  section?: string;
  option?: string;
  fees: number;
  titulaireId?: string | null;
  titulaire?: {
    id: string;
    fullName: string;
    email: string;
    phone?: string;
  } | null;
  _count?: {
    enrollments: number;
    courses: number;
  };
}

interface TeacherItem {
  id: string;
  fullName: string;
  specialty?: string;
}

interface StudentInClass {
  id: string;
  fullName: string;
  email: string;
  gender?: string;
  matricule?: string;
}

interface CourseInClass {
  id: string;
  name: string;
  coefficient?: number;
  weeklyHours?: number;
  teacher?: { fullName: string };
}

interface HumanitiesSectionItem { id: string; name: string; options: { id: string; name: string }[] }
interface HumanitiesAffectedClass {
  id: string;
  name: string;
  level: string;
  section: string;
  option: string;
  _count: { enrollments: number };
}
interface HumanitiesConflict {
  kind: 'section' | 'option';
  name: string;
  message: string;
  classes: HumanitiesAffectedClass[];
}

const levelColors: Record<string, string> = {
  Maternelle: 'bg-pink-100 text-pink-700 border-pink-200',
  Primaire: 'bg-blue-100 text-blue-700 border-blue-200',
  Secondaire: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const levelBgColors: Record<string, string> = {
  Maternelle: 'bg-pink-50/40 border-pink-200 hover:border-pink-300',
  Primaire: 'bg-blue-50/40 border-blue-200 hover:border-blue-300',
  Secondaire: 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300',
};

const levelIcons: Record<string, typeof GraduationCap> = {
  Maternelle: Baby,
  Primaire: GraduationCap,
  Secondaire: School,
};

const levelIconBg: Record<string, string> = {
  Maternelle: 'bg-pink-100 text-pink-600',
  Primaire: 'bg-blue-100 text-blue-600',
  Secondaire: 'bg-emerald-100 text-emerald-600',
};

export default function AdminClasses() {
  const { user } = useAppStore();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const isReadOnly = user?.role === 'LECTEUR';
  const [humanitiesSections, setHumanitiesSections] = useState<HumanitiesSectionItem[]>([]);
  const [humanitiesConflict, setHumanitiesConflict] = useState<HumanitiesConflict | null>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [newOptionNames, setNewOptionNames] = useState<Record<string, string>>({});

  // Dialogue Création / Modification
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formLevel, setFormLevel] = useState('Primaire');
  const [formCycle, setFormCycle] = useState('EB');
  const [formSection, setFormSection] = useState('');
  const [formOption, setFormOption] = useState('');
  const [formFees, setFormFees] = useState('0');
  const [formTitulaireId, setFormTitulaireId] = useState<string>('none');
  const [submitting, setSubmitting] = useState(false);

  // Dialogue Suppression
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingClass, setDeletingClass] = useState<ClassItem | null>(null);

  // Dialogue Liste des Élèves
  const [studentsDialogOpen, setStudentsDialogOpen] = useState(false);
  const [selectedClassForStudents, setSelectedClassForStudents] = useState<ClassItem | null>(null);
  const [classStudents, setClassStudents] = useState<StudentInClass[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Dialogue Liste des Cours
  const [coursesDialogOpen, setCoursesDialogOpen] = useState(false);
  const [selectedClassForCourses, setSelectedClassForCourses] = useState<ClassItem | null>(null);
  const [classCourses, setClassCourses] = useState<CourseInClass[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);

  // Dialogue Transfert d'Élèves
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [sourceClassForTransfer, setSourceClassForTransfer] = useState<ClassItem | null>(null);
  const [targetClassId, setTargetClassId] = useState<string>('');
  const [transferStudents, setTransferStudents] = useState<StudentInClass[]>([]);
  const [selectedStudentIdsToTransfer, setSelectedStudentIdsToTransfer] = useState<string[]>([]);
  const [transferring, setTransferring] = useState(false);

  const fetchClasses = useCallback(async () => {
    if (!user?.schoolId) return;
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsOffline(true);
        const { getLocalDB } = await import('@/lib/offline/db');
        const local = await getLocalDB().classes.where('schoolId').equals(user.schoolId).toArray();
        setClasses(local as any);
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/classes?schoolId=${user.schoolId}`);
      if (res.ok) {
        const data = await res.json();
        setClasses(Array.isArray(data.classes) ? data.classes : []);
        setIsOffline(false);
      } else {
        throw new Error('Erreur de chargement');
      }
    } catch {
      setIsOffline(true);
      try {
        const { getLocalDB } = await import('@/lib/offline/db');
        const local = await getLocalDB().classes.where('schoolId').equals(user?.schoolId || '').toArray();
        if (local.length > 0) setClasses(local as any);
      } catch {
        // Ignorer
      }
    } finally {
      setLoading(false);
    }
  }, [user?.schoolId]);

  const fetchTeachers = useCallback(async () => {
    if (!user?.schoolId) return;
    try {
      const res = await fetch(`/api/users?schoolId=${user.schoolId}&role=TEACHER`);
      if (res.ok) {
        const data = await res.json();
        setTeachers(Array.isArray(data.users) ? data.users : []);
      }
    } catch {
      // Ignorer
    }
  }, [user?.schoolId]);

  const fetchHumanitiesStructure = useCallback(async () => {
    if (!user?.schoolId) return;
    const response = await fetch('/api/admin/humanities-structure');
    if (!response.ok) return;
    const data = await response.json();
    setHumanitiesSections(Array.isArray(data.sections) ? data.sections : []);
  }, [user?.schoolId]);

  useEffect(() => {
    if (user?.schoolId) {
      fetchClasses();
      fetchTeachers();
      fetchHumanitiesStructure();
    }
  }, [fetchClasses, fetchTeachers, fetchHumanitiesStructure, user?.schoolId]);

  const saveStructure = async (method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>) => {
    const response = await fetch('/api/admin/humanities-structure', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error || 'Impossible de modifier la configuration.'), { status: response.status, classes: result.classes });
    await fetchHumanitiesStructure();
    if (method === 'PATCH') await fetchClasses();
  };

  const addSection = async () => {
    try {
      await saveStructure('POST', { action: 'create-section', name: newSectionName });
      setNewSectionName('');
      toast.success('Section ajoutée.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Erreur.'); }
  };

  const resetForm = () => {
    setFormName('');
    setFormLevel('Primaire');
    setFormCycle('EB');
    setFormSection('');
    setFormOption('');
    setFormFees('0');
    setFormTitulaireId('none');
    setEditingClass(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (c: ClassItem) => {
    setEditingClass(c);
    setFormName(c.name);
    setFormLevel(c.level || 'Primaire');
    setFormCycle(c.cycle === 'Humanites' ? 'Humanites' : 'EB');
    setFormSection(c.section || '');
    setFormOption(c.option || '');
    setFormFees(String(c.fees || 0));
    setFormTitulaireId(c.titulaireId || c.titulaire?.id || 'none');
    setDialogOpen(true);
  };

  const removeHumanitiesItem = async (kind: 'section' | 'option', item: { id: string; name: string }) => {
    try {
      await saveStructure('DELETE', { kind, id: item.id });
      toast.success(`${kind === 'section' ? 'Section' : 'Option'} « ${item.name} » supprimée.`);
    } catch (error) {
      const details = error as Error & { status?: number; classes?: HumanitiesAffectedClass[] };
      if (details.status === 409) {
        setHumanitiesConflict({ kind, name: item.name, message: details.message, classes: Array.isArray(details.classes) ? details.classes : [] });
        return;
      }
      toast.error(details.message || 'Impossible de supprimer cet élément. Réessayez.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error('Le nom de la classe est obligatoire.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        schoolId: user?.schoolId,
        name: formName.trim(),
        level: formLevel,
        cycle: formLevel === 'Secondaire' ? formCycle : formLevel,
        section: formLevel === 'Secondaire' && formCycle === 'Humanites' ? formSection.trim() : '',
        option: formLevel === 'Secondaire' && formCycle === 'Humanites' ? formOption.trim() : '',
        fees: parseFloat(formFees) || 0,
        titulaireId: formTitulaireId === 'none' ? null : formTitulaireId,
      };

      if (editingClass) {
        const res = await fetch(`/api/classes/${editingClass.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur lors de la modification');
        toast.success(`Classe "${formName}" modifiée avec succès`);
      } else {
        const res = await fetch('/api/classes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur lors de la création');
        toast.success(`Classe "${formName}" créée avec succès`);
      }

      setDialogOpen(false);
      resetForm();
      fetchClasses();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur opération');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingClass) return;
    try {
      const res = await fetch(`/api/classes/${deletingClass.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur de suppression');
      toast.success('Classe supprimée avec succès');
      setDeleteDialogOpen(false);
      setDeletingClass(null);
      fetchClasses();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Échec de la suppression');
    }
  };

  // Charger les élèves d'une classe pour consultation
  const openStudentsList = async (c: ClassItem) => {
    setSelectedClassForStudents(c);
    setStudentsDialogOpen(true);
    setLoadingStudents(true);
    try {
      const res = await fetch(`/api/users?schoolId=${user?.schoolId}&role=STUDENT&classId=${c.id}`);
      if (res.ok) {
        const data = await res.json();
        setClassStudents(Array.isArray(data.users) ? data.users : []);
      }
    } catch {
      toast.error('Impossible de charger la liste des élèves');
    } finally {
      setLoadingStudents(false);
    }
  };

  // Charger les cours d'une classe pour consultation
  const openCoursesList = async (c: ClassItem) => {
    setSelectedClassForCourses(c);
    setCoursesDialogOpen(true);
    setLoadingCourses(true);
    try {
      const res = await fetch(`/api/courses?schoolId=${user?.schoolId}&classId=${c.id}`);
      if (res.ok) {
        const data = await res.json();
        setClassCourses(Array.isArray(data.courses) ? data.courses : Array.isArray(data) ? data : []);
      }
    } catch {
      toast.error('Impossible de charger les cours');
    } finally {
      setLoadingCourses(false);
    }
  };

  // Ouvrir le dialogue de transfert
  const openTransferDialog = async (c: ClassItem) => {
    setSourceClassForTransfer(c);
    setSelectedStudentIdsToTransfer([]);
    setTargetClassId('');
    setTransferDialogOpen(true);
    try {
      const res = await fetch(`/api/users?schoolId=${user?.schoolId}&role=STUDENT&classId=${c.id}`);
      if (res.ok) {
        const data = await res.json();
        setTransferStudents(Array.isArray(data.users) ? data.users : []);
      }
    } catch {
      toast.error('Erreur de chargement des élèves');
    }
  };

  const handleExecuteTransfer = async () => {
    if (!sourceClassForTransfer || !targetClassId || selectedStudentIdsToTransfer.length === 0) {
      toast.error('Sélectionnez les élèves et la classe cible.');
      return;
    }

    setTransferring(true);
    try {
      const res = await fetch('/api/classes/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromClassId: sourceClassForTransfer.id,
          toClassId: targetClassId,
          studentIds: selectedStudentIdsToTransfer,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors du transfert');
      toast.success(data.message || 'Transfert effectué avec succès');
      setTransferDialogOpen(false);
      fetchClasses();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Échec du transfert');
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 p-5 lg:p-7 text-white shadow-lg shadow-blue-500/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold">Gestion des classes</h1>
              {isOffline && (
                <Badge variant="outline" className="bg-amber-400/20 text-amber-200 border-amber-300/40 text-xs">
                  Hors ligne
                </Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-blue-100 mt-1">
              Structure pédagogique, titulariat, frais et effectifs ({classes.length} classes)
            </p>
          </div>
          {!isReadOnly && <Button
            onClick={openCreateDialog}
            className="bg-white text-blue-700 hover:bg-blue-50 font-bold shadow-md min-h-[44px]"
          >
            <FolderPlus className="h-4 w-4 mr-2" />
            Créer une classe
          </Button>}
        </div>
      </div>

      {isReadOnly && <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">Consultation en lecture seule : les modifications de classes et de structure sont réservées à l’administration.</div>}

      {!isReadOnly && <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sections et options des Humanités</CardTitle>
          <CardDescription>Configuration propre à l’école, réutilisée pour les classes et les inscriptions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} placeholder="Nom de la nouvelle section" maxLength={80} />
            <Button onClick={() => void addSection()} disabled={!newSectionName.trim()} className="min-h-11 shrink-0"><Plus className="mr-2 size-4" />Ajouter une section</Button>
          </div>
          {humanitiesSections.map((section) => <div key={section.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{section.name}</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { const name = window.prompt('Nouveau nom de la section', section.name); if (name?.trim()) void saveStructure('PATCH', { kind: 'section', id: section.id, name }).then(() => toast.success('Section modifiée.')).catch((error) => toast.error(error.message)); }}><Pencil className="mr-1 size-3.5" />Renommer</Button>
                <Button size="sm" variant="outline" className="min-h-10 text-red-600" onClick={() => void removeHumanitiesItem('section', section)}><Trash2 className="mr-1 size-3.5" />Supprimer</Button>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input value={newOptionNames[section.id] || ''} onChange={(event) => setNewOptionNames((previous) => ({ ...previous, [section.id]: event.target.value }))} placeholder={`Nouvelle option pour ${section.name}`} maxLength={80} />
              <Button size="sm" variant="secondary" className="min-h-11 shrink-0" disabled={!(newOptionNames[section.id] || '').trim()} onClick={() => void saveStructure('POST', { action: 'create-option', sectionId: section.id, name: newOptionNames[section.id] }).then(() => { setNewOptionNames((previous) => ({ ...previous, [section.id]: '' })); toast.success('Option ajoutée.'); }).catch((error) => toast.error(error.message))}><Plus className="mr-1 size-3.5" />Ajouter</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">{section.options.map((option) => <Badge key={option.id} variant="secondary" className="gap-1.5 py-1">
              {option.name}
              <button aria-label={`Renommer ${option.name}`} className="text-muted-foreground hover:text-foreground" onClick={() => { const name = window.prompt('Nouveau nom de l’option', option.name); if (name?.trim()) void saveStructure('PATCH', { kind: 'option', id: option.id, name }).then(() => toast.success('Option modifiée.')).catch((error) => toast.error(error.message)); }}><Pencil className="size-3" /></button>
              <button type="button" aria-label={`Supprimer ${option.name}`} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded text-red-600 hover:bg-red-50" onClick={() => void removeHumanitiesItem('option', option)}><Trash2 className="size-3" /></button>
            </Badge>)}</div>
          </div>)}
          {humanitiesSections.length === 0 && <p className="text-sm text-muted-foreground">Aucune section configurée. Ajoutez d’abord une section, puis ses options.</p>}
        </CardContent>
      </Card>}

      <Dialog open={Boolean(humanitiesConflict)} onOpenChange={(open) => { if (!open) setHumanitiesConflict(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{humanitiesConflict?.kind === 'section' ? 'Section encore utilisée' : 'Option encore utilisée'}</DialogTitle>
            <DialogDescription>{humanitiesConflict?.message} Modifiez la structure de chaque classe concernée avant de supprimer cet élément.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {humanitiesConflict?.classes.map((affected) => {
              const localClass = classes.find((item) => item.id === affected.id);
              return <div key={affected.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{affected.name}</p>
                  <p className="text-xs text-muted-foreground">{affected.level} · {affected.section} · {affected.option} · {affected._count.enrollments} élève(s) inscrit(s)</p>
                </div>
                {localClass && <Button type="button" variant="outline" className="min-h-10 shrink-0" onClick={() => {
                  setHumanitiesConflict(null);
                  openEditDialog(localClass);
                }}><Pencil className="mr-2 size-4" />Modifier cette classe</Button>}
              </div>;
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setHumanitiesConflict(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grille des classes */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <div className="text-center py-20 bg-card border rounded-2xl p-6">
          <div className="mx-auto w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-4">
            <School className="h-10 w-10 text-blue-500" />
          </div>
          <h3 className="text-lg font-bold mb-1">Aucune classe enregistrée</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-5">
            Créez votre première classe (ex: 6ème A, 1ère Maternelle) pour inscrire des élèves et planifier des cours.
          </p>
          {!isReadOnly && <Button onClick={openCreateDialog} className="min-h-[44px]">
            <Plus className="h-4 w-4 mr-2" />
            Créer ma première classe
          </Button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((c) => {
            const LevelIcon = levelIcons[c.level] || School;
            const titulaireName = c.titulaire?.fullName || 'Non désigné';

            return (
              <Card
                key={c.id}
                className={`rounded-2xl border-2 transition-all duration-200 hover:shadow-md flex flex-col justify-between ${
                  levelBgColors[c.level] || 'bg-card border-border'
                }`}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${levelIconBg[c.level] || 'bg-blue-100 text-blue-600'}`}>
                        <LevelIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-bold text-foreground">{c.name}</CardTitle>
                        <Badge variant="outline" className={`mt-1 text-[11px] ${levelColors[c.level] || ''}`}>
                          {c.level}
                        </Badge>
                        {c.level === 'Secondaire' && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {c.cycle === 'Humanites' ? 'Humanités' : 'Éducation de base (EB)'}
                            </Badge>
                            {c.cycle === 'Humanites' && c.section && <Badge variant="outline" className="text-[10px]">{c.section}</Badge>}
                            {c.cycle === 'Humanites' && c.option && <Badge variant="outline" className="text-[10px]">{c.option}</Badge>}
                          </div>
                        )}
                      </div>
                    </div>

                    {!isReadOnly && <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Modifier la classe"
                        className="h-8 w-8 hover:bg-background/80"
                        onClick={() => openEditDialog(c)}
                      >
                        <Pencil className="h-3.5 w-3.5 text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Supprimer la classe"
                        className="h-8 w-8 hover:bg-red-50"
                        onClick={() => {
                          setDeletingClass(c);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>}
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-2 space-y-3">
                  {/* Titulaire */}
                  <div className="p-2.5 rounded-xl bg-background/80 border text-xs space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Professeur Titulaire</span>
                    <p className="font-semibold text-foreground truncate flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      {titulaireName}
                    </p>
                  </div>

                  {/* Statistiques (Effectifs, Cours, Frais) */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <button
                      onClick={() => openStudentsList(c)}
                      className="p-2 rounded-xl bg-background/70 border hover:bg-background transition-colors text-left sm:text-center min-h-[44px] flex flex-col justify-center"
                    >
                      <span className="text-[10px] text-muted-foreground block">Élèves</span>
                      <span className="font-bold text-sm text-foreground">{c._count?.enrollments || 0}</span>
                    </button>
                    <button
                      onClick={() => openCoursesList(c)}
                      className="p-2 rounded-xl bg-background/70 border hover:bg-background transition-colors text-left sm:text-center min-h-[44px] flex flex-col justify-center"
                    >
                      <span className="text-[10px] text-muted-foreground block">Cours</span>
                      <span className="font-bold text-sm text-foreground">{c._count?.courses || 0}</span>
                    </button>
                    <div className="p-2 rounded-xl bg-background/70 border min-h-[44px] flex flex-col justify-center text-left sm:text-center">
                      <span className="text-[10px] text-muted-foreground block">Écolage</span>
                      <span className="font-bold text-sm text-emerald-600">{c.fees || 0} $</span>
                    </div>
                  </div>

                  {/* Action Transfert d'Élèves */}
                  {!isReadOnly && <div className="pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openTransferDialog(c)}
                      className="w-full min-h-[44px] text-xs font-semibold gap-1.5 bg-background hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      Transférer des élèves
                    </Button>
                  </div>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogue Créer / Modifier Classe */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <School className="w-5 h-5 text-blue-600" />
              {editingClass ? 'Modifier la classe' : 'Créer une nouvelle classe'}
            </DialogTitle>
            <DialogDescription>
              Configurez le nom, le niveau d&apos;enseignement, les frais scolaires et le professeur titulaire.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="class-name">Nom de la classe *</Label>
              <Input
                id="class-name"
                placeholder="Ex: 6ème Primaire A, 2ème Humanités Bio-Chimie"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-11"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Niveau d&apos;enseignement *</Label>
              <Select value={formLevel} onValueChange={(value) => {
                setFormLevel(value);
                if (value !== 'Secondaire') {
                  setFormCycle(value);
                  setFormSection('');
                  setFormOption('');
                } else if (!['EB', 'Humanites'].includes(formCycle)) {
                  setFormCycle('EB');
                }
              }}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Maternelle">Maternelle</SelectItem>
                  <SelectItem value="Primaire">Primaire</SelectItem>
                  <SelectItem value="Secondaire">Secondaire / Humanités</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formLevel === 'Secondaire' && (
              <div className="space-y-1.5">
                <Label>Cycle secondaire *</Label>
                <Select value={formCycle} onValueChange={(value) => {
                  setFormCycle(value);
                  if (value !== 'Humanites') {
                    setFormSection('');
                    setFormOption('');
                  }
                }}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EB">Éducation de base (EB — 7e et 8e)</SelectItem>
                    <SelectItem value="Humanites">Humanités (1re à 4e)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">L&apos;Éducation de base et les Humanités sont enregistrées dans des cycles distincts.</p>
              </div>
            )}

            {formLevel === 'Secondaire' && formCycle === 'Humanites' && (
              <div className="grid gap-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3 sm:grid-cols-2 dark:border-blue-900/50 dark:bg-blue-950/20">
                <div className="space-y-1.5">
                  <Label>Section des Humanités *</Label>
                  <Select value={formSection || 'none'} onValueChange={(value) => { setFormSection(value === 'none' ? '' : value); setFormOption(''); }}>
                    <SelectTrigger className="h-11 bg-background"><SelectValue placeholder="Choisir une section" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Choisir une section</SelectItem>
                      {humanitiesSections.map((section) => <SelectItem key={section.id} value={section.name}>{section.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Option des Humanités *</Label>
                  <Select value={formOption || 'none'} onValueChange={(value) => setFormOption(value === 'none' ? '' : value)} disabled={!formSection}>
                    <SelectTrigger className="h-11 bg-background"><SelectValue placeholder={formSection ? 'Choisir une option' : 'Choisir d’abord une section'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Choisir une option</SelectItem>
                      {humanitiesSections.find((section) => section.name === formSection)?.options.map((option) => <SelectItem key={option.id} value={option.name}>{option.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <p className="-mt-2 text-[11px] text-muted-foreground sm:col-span-2">Les options dépendent de la section configurée par l&apos;école. Ajoutez les listes depuis le haut de cette page.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="class-fees">Frais scolaires annuels d&apos;écolage ($ ou FC)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="class-fees"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formFees}
                  onChange={(e) => setFormFees(e.target.value)}
                  className="pl-9 h-11"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Désigner le Professeur Titulaire</Label>
              <Select value={formTitulaireId} onValueChange={setFormTitulaireId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Choisir un enseignant titulaire" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun titulaire pour le moment</SelectItem>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.fullName} {t.specialty ? `(${t.specialty})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Le titulaire valide les bulletins périodiques et semestriels avant transmission à l&apos;administration.
              </p>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="min-h-[44px]">
                Annuler
              </Button>
              <Button type="submit" disabled={submitting} className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-bold">
                {submitting ? 'Enregistrement...' : editingClass ? 'Sauvegarder' : 'Créer la classe'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialogue Liste des Élèves de la classe */}
      <Dialog open={studentsDialogOpen} onOpenChange={setStudentsDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Élèves inscrits — {selectedClassForStudents?.name}
            </DialogTitle>
            <DialogDescription>
              Effectif total : {classStudents.length} élève(s)
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {loadingStudents ? (
              <div className="space-y-2 py-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : classStudents.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Aucun élève inscrit dans cette classe.</p>
            ) : (
              <div className="border rounded-xl overflow-hidden divide-y max-h-72 overflow-y-auto">
                {classStudents.map((s) => (
                  <div key={s.id} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-foreground">{s.fullName}</p>
                      <p className="text-muted-foreground">{s.email || '—'}</p>
                    </div>
                    {s.matricule && (
                      <span className="font-mono text-[11px] bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                        {s.matricule}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setStudentsDialogOpen(false)} className="w-full min-h-[44px]">
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue Liste des Cours de la classe */}
      <Dialog open={coursesDialogOpen} onOpenChange={setCoursesDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              Cours programmés — {selectedClassForCourses?.name}
            </DialogTitle>
            <DialogDescription>
              Volume horaire et enseignants responsables
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {loadingCourses ? (
              <div className="space-y-2 py-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : classCourses.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Aucun cours rattaché pour le moment.</p>
            ) : (
              <div className="border rounded-xl overflow-hidden divide-y max-h-72 overflow-y-auto">
                {classCourses.map((crs) => (
                  <div key={crs.id} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-foreground">{crs.name}</p>
                      <p className="text-muted-foreground">Prof : {crs.teacher?.fullName || 'Non assigné'}</p>
                    </div>
                    <div className="text-right space-y-0.5">
                      <Badge variant="outline" className="text-[10px]">Coef. {crs.coefficient || 1}</Badge>
                      {crs.weeklyHours ? <p className="text-[10px] text-muted-foreground">{crs.weeklyHours}h / sem.</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setCoursesDialogOpen(false)} className="w-full min-h-[44px]">
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue Transfert d'Élèves */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-600" />
              Transférer des élèves depuis {sourceClassForTransfer?.name}
            </DialogTitle>
            <DialogDescription>
              Sélectionnez les élèves à déplacer et la classe de destination.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Classe de destination *</Label>
              <Select value={targetClassId} onValueChange={setTargetClassId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Sélectionnez la classe de destination" />
                </SelectTrigger>
                <SelectContent>
                  {classes
                    .filter((c) => c.id !== sourceClassForTransfer?.id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.level})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  Élèves à transférer ({selectedStudentIdsToTransfer.length} sélectionné(s))
                </Label>
                {transferStudents.length > 0 && (
                  <button
                    onClick={() => {
                      if (selectedStudentIdsToTransfer.length === transferStudents.length) {
                        setSelectedStudentIdsToTransfer([]);
                      } else {
                        setSelectedStudentIdsToTransfer(transferStudents.map((s) => s.id));
                      }
                    }}
                    className="text-xs text-blue-600 font-medium"
                  >
                    {selectedStudentIdsToTransfer.length === transferStudents.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </button>
                )}
              </div>

              {transferStudents.length === 0 ? (
                <p className="text-xs text-muted-foreground p-4 text-center border rounded-xl">
                  Cette classe ne contient aucun élève à transférer.
                </p>
              ) : (
                <div className="border rounded-xl max-h-56 overflow-y-auto divide-y">
                  {transferStudents.map((s) => {
                    const isChecked = selectedStudentIdsToTransfer.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={`flex items-center gap-3 p-3 text-xs cursor-pointer hover:bg-muted/50 transition-colors ${
                          isChecked ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedStudentIdsToTransfer((prev) =>
                              prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                            );
                          }}
                          className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">{s.fullName}</p>
                          {s.matricule && <p className="font-mono text-[10px] text-muted-foreground">{s.matricule}</p>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)} className="min-h-[44px]">
              Annuler
            </Button>
            <Button
              onClick={handleExecuteTransfer}
              disabled={transferring || selectedStudentIdsToTransfer.length === 0 || !targetClassId}
              className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              {transferring ? 'Transfert en cours...' : `Confirmer le transfert (${selectedStudentIdsToTransfer.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Suppression Classe */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Supprimer la classe &quot;{deletingClass?.name}&quot;
            </AlertDialogTitle>
            <AlertDialogDescription>
              {((deletingClass?._count?.enrollments || 0) + (deletingClass?._count?.courses || 0)) > 0
                ? `Cette classe contient ${deletingClass?._count?.enrollments || 0} élève(s) et ${deletingClass?._count?.courses || 0} cours. Transférez d’abord les élèves avec l’action « Transférer des élèves » et réaffectez les cours. Le serveur bloquera toute suppression tant que des éléments liés existent.`
                : 'Vérification de toutes les données liées avant suppression. Si un frais, un cours, un bulletin ou une inscription utilise encore cette classe, la suppression sera refusée avec les éléments à traiter.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={Boolean((deletingClass?._count?.enrollments || 0) + (deletingClass?._count?.courses || 0))} className="min-h-[44px] bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-50">
              Vérifier et supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
