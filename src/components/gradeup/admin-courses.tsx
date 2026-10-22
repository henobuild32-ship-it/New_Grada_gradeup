'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import type { ClassInfo, CourseInfo, UserInfo } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  BookOpen,
  Plus,
  Trash2,
  GraduationCap,
  Users,
  FileText,
  BarChart3,
  User,
  School,
  Calendar,
  Clock,
  Search,
  Edit2,
  WifiOff,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { getLocalDB } from '@/lib/offline/db';

export default function AdminCourses() {
  const { user } = useAppStore();
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [teachers, setTeachers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState<string>('ALL');
  const [filterTeacher, setFilterTeacher] = useState<string>('ALL');

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseDesc, setNewCourseDesc] = useState('');
  const [newCourseCoefficient, setNewCourseCoefficient] = useState('1');
  const [newCourseWeeklyHours, setNewCourseWeeklyHours] = useState('2');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editCourse, setEditCourse] = useState<CourseInfo | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCoefficient, setEditCoefficient] = useState('1');
  const [editWeeklyHours, setEditWeeklyHours] = useState('2');
  const [editClassId, setEditClassId] = useState('');
  const [editTeacherId, setEditTeacherId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete dialog
  const [courseToDelete, setCourseToDelete] = useState<CourseInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Schedule dialog state
  const [showSchedules, setShowSchedules] = useState(false);
  const [selectedCourseForSched, setSelectedCourseForSched] = useState<CourseInfo | null>(null);
  const [courseSchedules, setCourseSchedules] = useState<any[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [newDayOfWeek, setNewDayOfWeek] = useState('1');
  const [newStartTime, setNewStartTime] = useState('08:00');
  const [newEndTime, setNewEndTime] = useState('09:30');
  const [newRoom, setNewRoom] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Check online status
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchData = useCallback(async () => {
    if (!user?.schoolId) return;
    setLoading(true);

    try {
      if (!navigator.onLine) {
        setIsOffline(true);
        // Fallback Dexie
        const localDb = getLocalDB();
        const [localCourses, localClasses, localUsers] = await Promise.all([
          localDb.courses.where('schoolId').equals(user.schoolId).toArray(),
          localDb.classes.where('schoolId').equals(user.schoolId).toArray(),
          localDb.users.where('schoolId').equals(user.schoolId).filter((u) => u.role === 'TEACHER').toArray(),
        ]);
        setCourses(localCourses as any[]);
        setClasses(localClasses as any[]);
        setTeachers(localUsers as any[]);
        setLoading(false);
        return;
      }

      const [coursesRes, classesRes, teachersRes] = await Promise.all([
        fetch(`/api/courses?schoolId=${user.schoolId}`),
        fetch(`/api/classes?schoolId=${user.schoolId}`),
        fetch(`/api/users?schoolId=${user.schoolId}&role=TEACHER`),
      ]);

      const coursesData = await coursesRes.json();
      const classesData = await classesRes.json();
      const teachersData = await teachersRes.json();

      const fetchedCourses: CourseInfo[] = Array.isArray(coursesData.courses)
        ? coursesData.courses
        : Array.isArray(coursesData)
        ? coursesData
        : [];
      const fetchedClasses = Array.isArray(classesData)
        ? classesData
        : Array.isArray(classesData.classes)
        ? classesData.classes
        : [];
      const fetchedTeachers = Array.isArray(teachersData.users) ? teachersData.users : [];

      setCourses(fetchedCourses);
      setClasses(fetchedClasses);
      setTeachers(fetchedTeachers);

      // Save to Dexie for offline use
      try {
        const localDb = getLocalDB();
        const now = Date.now();
        await localDb.courses.bulkPut(
          fetchedCourses.map((c) => ({
            id: c.id,
            schoolId: user.schoolId,
            classId: c.classId,
            teacherId: c.teacherId,
            name: c.name,
            coefficient: c.coefficient ?? 1,
            status: c.status || 'ACTIVE',
            updatedAt: now,
            version: 1,
            syncStatus: 'synced',
          }))
        );
      } catch (err) {
        console.warn('Dexie courses cache error:', err);
      }
    } catch {
      // Offline fallback
      try {
        const localDb = getLocalDB();
        const localCourses = await localDb.courses.where('schoolId').equals(user.schoolId).toArray();
        setCourses(localCourses as any[]);
        toast.info('Mode hors-ligne : données chargées depuis le stockage local');
      } catch {
        toast.error('Erreur lors du chargement des données');
      }
    } finally {
      setLoading(false);
    }
  }, [user?.schoolId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Open Edit Dialog
  const handleOpenEdit = (course: CourseInfo) => {
    setEditCourse(course);
    setEditName(course.name);
    setEditDesc(course.description || '');
    setEditCoefficient(String(course.coefficient ?? 1));
    setEditWeeklyHours(String(course.weeklyHours ?? 2));
    setEditClassId(course.classId);
    setEditTeacherId(course.teacherId);
  };

  const handleSaveEdit = async () => {
    if (!editCourse || !editName.trim() || !editClassId || !editTeacherId) {
      toast.error('Veuillez renseigner les champs obligatoires');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/courses/${editCourse.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim(),
          classId: editClassId,
          teacherId: editTeacherId,
          coefficient: Math.max(1, Math.min(10, parseInt(editCoefficient, 10) || 1)),
          weeklyHours: Math.max(0, parseFloat(editWeeklyHours) || 0),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur lors de la modification');
      }

      toast.success('Cours mis à jour avec succès');
      setEditCourse(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Erreur de modification');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleOpenSchedules = async (course: CourseInfo) => {
    setSelectedCourseForSched(course);
    setShowSchedules(true);
    setLoadingSchedules(true);
    setNewRoom('');
    try {
      const res = await fetch(`/api/schedules?schoolId=${user?.schoolId}&courseId=${course.id}`);
      if (res.ok) {
        const data = await res.json();
        setCourseSchedules(data);
      }
    } catch {
      toast.error('Erreur lors de la récupération des horaires');
    } finally {
      setLoadingSchedules(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!selectedCourseForSched || !user?.schoolId) return;
    setSavingSchedule(true);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: selectedCourseForSched.id,
          schoolId: user.schoolId,
          dayOfWeek: parseInt(newDayOfWeek, 10),
          startTime: newStartTime,
          endTime: newEndTime,
          room: newRoom.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur de sauvegarde');
      }

      toast.success('Horaire ajouté avec succès');
      const reloadRes = await fetch(`/api/schedules?schoolId=${user.schoolId}&courseId=${selectedCourseForSched.id}`);
      if (reloadRes.ok) {
        setCourseSchedules(await reloadRes.json());
      }
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la création de l'horaire");
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleDeleteSchedule = async (schedId: string) => {
    try {
      const res = await fetch(`/api/schedules?id=${schedId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur de suppression');
      toast.success('Créneau supprimé');
      setCourseSchedules(courseSchedules.filter((s) => s.id !== schedId));
    } catch {
      toast.error("Erreur lors de la suppression de l'horaire");
    }
  };

  const handleCreateCourse = async () => {
    if (!newCourseName.trim() || !selectedClassId || !selectedTeacherId) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: user?.schoolId,
          classId: selectedClassId,
          teacherId: selectedTeacherId,
          name: newCourseName.trim(),
          description: newCourseDesc.trim(),
          coefficient: Math.max(1, parseInt(newCourseCoefficient, 10) || 1),
          weeklyHours: Math.max(0, parseFloat(newCourseWeeklyHours) || 0),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur lors de la création');
      }
      toast.success('Cours créé et attribué au professeur !');
      setShowCreate(false);
      setNewCourseName('');
      setNewCourseDesc('');
      setNewCourseCoefficient('1');
      setNewCourseWeeklyHours('2');
      setSelectedClassId('');
      setSelectedTeacherId('');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de la création du cours');
    } finally {
      setCreating(false);
    }
  };

  const confirmDeleteCourse = async () => {
    if (!courseToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/courses/${courseToDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur de suppression');
      }
      toast.success(`Cours "${courseToDelete.name}" supprimé`);
      setCourseToDelete(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  const getTeacherName = (teacherId: string) => {
    const t = teachers.find((t) => t.id === teacherId);
    return t?.fullName || 'Inconnu';
  };

  const getClassName = (classId: string) => {
    const c = classes.find((c) => c.id === classId);
    return c ? `${c.name} (${c.level || ''})` : 'Inconnue';
  };

  const getDayName = (dayNum: number) => {
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    return days[dayNum - 1] || 'Jour inconnu';
  };

  // Filtered courses
  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchClass = filterClass === 'ALL' || c.classId === filterClass;
      const matchTeacher = filterTeacher === 'ALL' || c.teacherId === filterTeacher;
      return matchSearch && matchClass && matchTeacher;
    });
  }, [courses, searchQuery, filterClass, filterTeacher]);

  if (!user) return null;

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Offline banner */}
      {isOffline && (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-700 dark:text-amber-300 text-sm">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>Mode hors-ligne : vous consultez la copie locale des cours enregistrés sur cet appareil.</span>
        </div>
      )}

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 p-6 lg:p-8 text-white shadow-xl shadow-blue-500/20">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-white/15 backdrop-blur-sm">
              <BookOpen className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Gestion des Cours</h1>
              <p className="text-blue-100 text-sm">
                {courses.length} cours · {teachers.length} professeurs · {classes.length} classes
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowCreate(true)}
            className="min-h-[44px] bg-white text-blue-700 hover:bg-blue-50 hover:scale-[1.02] active:scale-[0.98] shadow-lg transition-all w-full sm:w-auto font-medium"
          >
            <Plus className="h-4 w-4 mr-2" />
            Distribuer un cours
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-3 sm:p-5 flex items-center gap-3">
            <div className="p-2 sm:p-3 rounded-xl bg-blue-50 text-blue-600">
              <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Cours</p>
              <p className="text-lg sm:text-xl font-bold">{courses.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 sm:p-5 flex items-center gap-3">
            <div className="p-2 sm:p-3 rounded-xl bg-emerald-50 text-emerald-600">
              <Users className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Professeurs</p>
              <p className="text-lg sm:text-xl font-bold">{teachers.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 sm:p-5 flex items-center gap-3">
            <div className="p-2 sm:p-3 rounded-xl bg-purple-50 text-purple-600">
              <School className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Classes</p>
              <p className="text-lg sm:text-xl font-bold">{classes.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card className="p-4 shadow-sm border space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom ou description de cours..."
            className="pl-9 min-h-[44px]"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger className="min-h-[44px] text-xs sm:text-sm">
                <SelectValue placeholder="Toutes les classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes les classes</SelectItem>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name} ({cls.level || 'Sans niveau'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={filterTeacher} onValueChange={setFilterTeacher}>
              <SelectTrigger className="min-h-[44px] text-xs sm:text-sm">
                <SelectValue placeholder="Tous les professeurs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les professeurs</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Courses List */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="text-center py-16 bg-muted/20 rounded-2xl border border-dashed">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-3">
            <BookOpen className="h-8 w-8 text-muted-foreground/60" />
          </div>
          <h3 className="text-lg font-semibold mb-1">Aucun cours trouvé</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {courses.length === 0
              ? 'Commencez par distribuer un cours à une classe et un professeur'
              : 'Aucun cours ne correspond aux filtres sélectionnés'}
          </p>
          {courses.length === 0 && (
            <Button
              onClick={() => setShowCreate(true)}
              className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white shadow"
            >
              <Plus className="h-4 w-4 mr-2" />
              Distribuer un cours
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCourses.map((course) => (
            <Card
              key={course.id}
              className="hover:shadow-md transition-all duration-200 border-l-4 border-l-blue-500 overflow-hidden"
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Left: Info */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-sm mt-0.5">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base sm:text-lg text-foreground">{course.name}</h3>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 font-medium">
                          {getClassName(course.classId)}
                        </Badge>
                        <Badge className="bg-amber-100 text-amber-900 border-amber-200 font-semibold text-xs">
                          Coef {course.coefficient ?? 1}
                        </Badge>
                        {course.weeklyHours !== undefined && course.weeklyHours > 0 && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            {course.weeklyHours}h / sem
                          </Badge>
                        )}
                      </div>

                      {course.description && (
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">
                          {course.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-3 text-xs sm:text-sm text-muted-foreground flex-wrap">
                        <div className="flex items-center gap-1.5 font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                          <User className="h-3.5 w-3.5" />
                          <span>{getTeacherName(course.teacherId)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          <span>{course._count?.lessons || 0} leçons</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <BarChart3 className="h-3.5 w-3.5" />
                          <span>{course._count?.grades || 0} notes</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <GraduationCap className="h-3.5 w-3.5" />
                          <span>{course._count?.homework || 0} devoirs</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 w-full sm:w-auto justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(course)}
                      className="min-h-[44px] sm:min-h-[36px] px-3 gap-1.5 text-xs font-semibold"
                      title="Modifier les détails du cours"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-blue-600" />
                      Modifier
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenSchedules(course)}
                      className="min-h-[44px] sm:min-h-[36px] px-3 gap-1.5 text-xs font-semibold"
                      title="Gérer les horaires du cours"
                    >
                      <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                      Horaires
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCourseToDelete(course)}
                      className="min-h-[44px] sm:min-h-[36px] px-2.5 text-red-500 hover:text-red-700 hover:bg-red-50"
                      title="Supprimer ce cours"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Course Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <BookOpen className="h-5 w-5" />
              </div>
              Distribuer un cours
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="course-class">Classe cible *</Label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger id="course-class" className="min-h-[44px]">
                  <SelectValue placeholder="Sélectionnez une classe..." />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      <span className="flex items-center gap-2">
                        <School className="h-3.5 w-3.5" /> {cls.name} ({cls.level})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="course-teacher">Professeur titulaire de la matière *</Label>
              <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                <SelectTrigger id="course-teacher" className="min-h-[44px]">
                  <SelectValue placeholder="Sélectionnez un professeur..." />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5" /> {t.fullName}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="course-name">Nom de la matière *</Label>
              <Input
                id="course-name"
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                placeholder="Ex: Mathématiques, Physique, Français..."
                className="min-h-[44px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="course-coef">Coefficient (1-10) *</Label>
                <Input
                  id="course-coef"
                  type="number"
                  min={1}
                  max={10}
                  value={newCourseCoefficient}
                  onChange={(e) => setNewCourseCoefficient(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="course-hours">Heures / sem</Label>
                <Input
                  id="course-hours"
                  type="number"
                  min={0}
                  step={0.5}
                  value={newCourseWeeklyHours}
                  onChange={(e) => setNewCourseWeeklyHours(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="course-desc">Description (optionnelle)</Label>
              <Textarea
                id="course-desc"
                value={newCourseDesc}
                onChange={(e) => setNewCourseDesc(e.target.value)}
                placeholder="Description du programme, objectifs pédagogiques..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowCreate(false)} className="min-h-[44px]">
              Annuler
            </Button>
            <Button
              onClick={handleCreateCourse}
              disabled={creating || !newCourseName.trim() || !selectedClassId || !selectedTeacherId}
              className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {creating ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {creating ? 'Création...' : 'Distribuer le cours'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Course Dialog */}
      <Dialog open={!!editCourse} onOpenChange={(o) => !o && setEditCourse(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <Edit2 className="h-5 w-5" />
              </div>
              Modifier le cours
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-class">Classe *</Label>
              <Select value={editClassId} onValueChange={setEditClassId}>
                <SelectTrigger id="edit-class" className="min-h-[44px]">
                  <SelectValue placeholder="Sélectionnez une classe..." />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      <span className="flex items-center gap-2">
                        <School className="h-3.5 w-3.5" /> {cls.name} ({cls.level})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-teacher">Professeur *</Label>
              <Select value={editTeacherId} onValueChange={setEditTeacherId}>
                <SelectTrigger id="edit-teacher" className="min-h-[44px]">
                  <SelectValue placeholder="Sélectionnez un professeur..." />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5" /> {t.fullName}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Nom de la matière *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="min-h-[44px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-coef">Coefficient (1-10) *</Label>
                <Input
                  id="edit-coef"
                  type="number"
                  min={1}
                  max={10}
                  value={editCoefficient}
                  onChange={(e) => setEditCoefficient(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-hours">Heures / sem</Label>
                <Input
                  id="edit-hours"
                  type="number"
                  min={0}
                  step={0.5}
                  value={editWeeklyHours}
                  onChange={(e) => setEditWeeklyHours(e.target.value)}
                  className="min-h-[44px]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditCourse(null)} className="min-h-[44px]">
              Annuler
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={savingEdit || !editName.trim() || !editClassId || !editTeacherId}
              className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {savingEdit ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!courseToDelete} onOpenChange={(o) => !o && setCourseToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Supprimer le cours
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer définitivement le cours{' '}
            <strong className="text-foreground">{courseToDelete?.name}</strong> ? Cette action supprimera
            également les leçons, devoirs et horaires associés.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCourseToDelete(null)} className="min-h-[44px]">
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteCourse}
              disabled={deleting}
              className="min-h-[44px]"
            >
              {deleting ? 'Suppression...' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedules Management Dialog */}
      <Dialog open={showSchedules} onOpenChange={setShowSchedules}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Calendar className="h-5 w-5 text-blue-600" />
              Horaires : {selectedCourseForSched?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-3">
            {/* Add Schedule Form */}
            <div className="p-4 rounded-xl bg-muted/40 border space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <Plus className="h-4 w-4 text-emerald-600" />
                Ajouter un créneau horaire
              </h4>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <Label htmlFor="sched-day" className="text-xs">Jour</Label>
                  <Select value={newDayOfWeek} onValueChange={setNewDayOfWeek}>
                    <SelectTrigger id="sched-day" className="min-h-[44px]">
                      <SelectValue placeholder="Jour..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Lundi</SelectItem>
                      <SelectItem value="2">Mardi</SelectItem>
                      <SelectItem value="3">Mercredi</SelectItem>
                      <SelectItem value="4">Jeudi</SelectItem>
                      <SelectItem value="5">Vendredi</SelectItem>
                      <SelectItem value="6">Samedi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <Label htmlFor="sched-room" className="text-xs">Salle</Label>
                  <Input
                    id="sched-room"
                    placeholder="Ex: Salle 102"
                    value={newRoom}
                    onChange={(e) => setNewRoom(e.target.value)}
                    className="min-h-[44px]"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="sched-start" className="text-xs">Début</Label>
                  <Input
                    id="sched-start"
                    type="time"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="min-h-[44px]"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="sched-end" className="text-xs">Fin</Label>
                  <Input
                    id="sched-end"
                    type="time"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className="min-h-[44px]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  onClick={handleCreateSchedule}
                  disabled={savingSchedule}
                  className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold w-full sm:w-auto"
                >
                  {savingSchedule && (
                    <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />
                  )}
                  Ajouter au créneau
                </Button>
              </div>
            </div>

            {/* Schedules List */}
            <div className="space-y-2">
              <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                Créneaux hebdomadaires
              </h4>
              {loadingSchedules ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : courseSchedules.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Aucun horaire enregistré pour ce cours.
                </p>
              ) : (
                <div className="space-y-2">
                  {courseSchedules.map((sched) => (
                    <div
                      key={sched.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/10 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {getDayName(sched.dayOfWeek)}
                        </Badge>
                        <span className="text-sm font-semibold flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          {sched.startTime} – {sched.endTime}
                        </span>
                        {sched.room && (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {sched.room}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteSchedule(sched.id)}
                        className="h-9 w-9 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowSchedules(false)} className="min-h-[44px] w-full sm:w-auto">
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
