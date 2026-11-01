'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import type { AnnouncementInfo } from '@/lib/types';
import {
  ANNOUNCEMENT_AUDIENCE_LABELS,
  ANNOUNCEMENT_AUDIENCE_TYPES,
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_CATEGORY_LABELS,
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_PRIORITY_LABELS,
  ANNOUNCEMENT_ROLES,
  ANNOUNCEMENT_ROLE_LABELS,
  type AnnouncementAudienceType,
  type AnnouncementCategory,
  type AnnouncementPriority,
  type AnnouncementRole,
} from '@/lib/announcements/audience';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Bell,
  CheckCheck,
  Clock,
  Eye,
  Globe,
  GraduationCap,
  Megaphone,
  PenLine,
  RefreshCw,
  School,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

interface ClassOption {
  id: string;
  name: string;
  level?: string;
  cycle?: string;
  section?: string;
  option?: string;
  _count?: { enrollments?: number };
}

interface UserOption {
  id: string;
  fullName: string;
  role: string;
  active?: boolean;
  matricule?: string;
  classEnrollments?: Array<{ classId: string; class?: { id: string; name: string } }>;
}

interface ComposeForm {
  title: string;
  content: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  audienceType: AnnouncementAudienceType;
  targetRoles: AnnouncementRole[];
  targetClassIds: string[];
  targetUserIds: string[];
  contextClassId: string;
  expiresAt: string;
}

const EMPTY_FORM: ComposeForm = {
  title: '',
  content: '',
  category: 'GENERAL',
  priority: 'NORMAL',
  audienceType: 'ALL',
  targetRoles: [],
  targetClassIds: [],
  targetUserIds: [],
  contextClassId: '',
  expiresAt: '',
};

const CATEGORY_STYLES: Record<string, string> = {
  GENERAL: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300',
  ACADEMIC: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300',
  FINANCIAL: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300',
  EVENT: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300',
  REMINDER: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300',
  URGENT: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300',
};

const ROLE_ICONS: Record<string, typeof User> = {
  ADMIN: ShieldAlert,
  TEACHER: GraduationCap,
  STUDENT: User,
  PARENT: Users,
  CAISSIER: Eye,
  LECTEUR: Eye,
};

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function classDisplayName(item: ClassOption): string {
  const details = [item.level, item.section, item.option].filter(Boolean).join(' · ');
  return details ? `${item.name} (${details})` : item.name;
}

function CategoryBadge({ category }: { category: string }) {
  const key = category in ANNOUNCEMENT_CATEGORY_LABELS ? category : 'GENERAL';
  return (
    <Badge variant="outline" className={`text-xs ${CATEGORY_STYLES[key] || CATEGORY_STYLES.GENERAL}`}>
      {ANNOUNCEMENT_CATEGORY_LABELS[key as AnnouncementCategory]}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'URGENT') {
    return <Badge className="bg-red-600 text-white text-xs">Urgente</Badge>;
  }
  if (priority === 'IMPORTANT') {
    return <Badge className="bg-amber-500 text-white text-xs">Importante</Badge>;
  }
  return <Badge variant="secondary" className="text-xs">Normale</Badge>;
}

export default function Announcements() {
  const { user } = useAppStore();
  const isAdmin = user?.role === 'ADMIN';
  const isReader = user?.role === 'LECTEUR';
  const canManage = isAdmin;

  const [view, setView] = useState<'inbox' | 'sent'>(isAdmin || isReader ? 'sent' : 'inbox');
  const [announcements, setAnnouncements] = useState<AnnouncementInfo[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [detail, setDetail] = useState<AnnouncementInfo | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState<ComposeForm>(EMPTY_FORM);
  const [studentSearch, setStudentSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [schoolUsers, setSchoolUsers] = useState<UserOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadAnnouncements = useCallback(async (showSpinner = false) => {
    if (!user?.schoolId) return;
    if (showSpinner) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        scope: view,
        limit: '300',
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
      if (unreadOnly) params.set('unread', 'true');

      const response = await fetch(`/api/announcements?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les communiqués.');
      setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
      setUnreadCount(Number(data.unreadCount) || 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur lors du chargement.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryFilter, debouncedSearch, unreadOnly, user?.schoolId, view]);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);

  useEffect(() => {
    const handler = () => { void loadAnnouncements(true); };
    window.addEventListener('gradeup-notification', handler);
    return () => window.removeEventListener('gradeup-notification', handler);
  }, [loadAnnouncements]);

  const loadOptions = useCallback(async () => {
    if (!isAdmin || !user?.schoolId) return;
    setOptionsLoading(true);
    try {
      const [classesResponse, usersResponse] = await Promise.all([
        fetch(`/api/classes?schoolId=${encodeURIComponent(user.schoolId)}`, { cache: 'no-store' }),
        fetch(`/api/users?schoolId=${encodeURIComponent(user.schoolId)}&status=active`, { cache: 'no-store' }),
      ]);
      const classesData = await classesResponse.json();
      const usersData = await usersResponse.json();
      if (classesResponse.ok) {
        setClasses(Array.isArray(classesData.classes) ? classesData.classes : []);
      }
      if (usersResponse.ok) {
        const list = Array.isArray(usersData.users) ? usersData.users : [];
        setSchoolUsers(list.filter((item: UserOption) => item.id && item.fullName && item.active !== false));
      }
    } catch {
      toast.error('Impossible de charger les classes et les personnes.');
    } finally {
      setOptionsLoading(false);
    }
  }, [isAdmin, user?.schoolId]);

  useEffect(() => {
    if (isAdmin && composeOpen) void loadOptions();
  }, [composeOpen, isAdmin, loadOptions]);

  const activeUsers = useMemo(
    () => schoolUsers.filter((item) => item.active !== false),
    [schoolUsers],
  );

  const studentsOfContextClass = useMemo(() => {
    if (!form.contextClassId) return [];
    const query = studentSearch.trim().toLowerCase();
    return activeUsers
      .filter((item) => item.role === 'STUDENT')
      .filter((item) => item.classEnrollments?.some((enrollment) => enrollment.classId === form.contextClassId))
      .filter((item) => {
        if (!query) return true;
        return item.fullName.toLowerCase().includes(query)
          || (item.matricule || '').toLowerCase().includes(query);
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'fr'));
  }, [activeUsers, form.contextClassId, studentSearch]);

  const filteredPeople = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return activeUsers
      .filter((item) => {
        if (!query) return true;
        return item.fullName.toLowerCase().includes(query)
          || (item.matricule || '').toLowerCase().includes(query)
          || item.role.toLowerCase().includes(query);
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'fr'));
  }, [activeUsers, userSearch]);

  const selectedClassNames = useMemo(() => {
    const map = new Map(classes.map((item) => [item.id, item.name]));
    return form.targetClassIds.map((id) => map.get(id)).filter((name): name is string => Boolean(name));
  }, [classes, form.targetClassIds]);

  const selectedContextClassName = useMemo(() => {
    return classes.find((item) => item.id === form.contextClassId)?.name || '';
  }, [classes, form.contextClassId]);

  const estimatedRecipients = useMemo(() => {
    switch (form.audienceType) {
      case 'ALL':
        return activeUsers.length;
      case 'ROLES':
        return activeUsers.filter((item) => form.targetRoles.includes(item.role as AnnouncementRole)).length;
      case 'CLASSES':
        return classes
          .filter((item) => form.targetClassIds.includes(item.id))
          .reduce((total, item) => total + (item._count?.enrollments || 0), 0);
      case 'STUDENTS':
        return form.targetUserIds.length;
      case 'USERS':
        return form.targetUserIds.length;
      default:
        return 0;
    }
  }, [activeUsers, classes, form.audienceType, form.targetClassIds, form.targetRoles, form.targetUserIds.length]);

  const audienceSummary = useMemo(() => {
    switch (form.audienceType) {
      case 'ALL':
        return 'Tout le monde (personnel, professeurs, élèves, parents, caisse et lecteurs)';
      case 'ROLES':
        return form.targetRoles.length > 0
          ? form.targetRoles.map((role) => ANNOUNCEMENT_ROLE_LABELS[role]).join(', ')
          : 'Aucun rôle sélectionné';
      case 'CLASSES':
        return form.targetClassIds.length > 0
          ? `${selectedClassNames.join(', ')} — élèves et leurs parents`
          : 'Aucune classe sélectionnée';
      case 'STUDENTS':
        return form.targetUserIds.length > 0
          ? `${form.targetUserIds.length} élève(s)${selectedContextClassName ? ` de ${selectedContextClassName}` : ''} et leurs parents`
          : 'Aucun élève sélectionné';
      case 'USERS':
        return form.targetUserIds.length > 0
          ? `${form.targetUserIds.length} personne(s) sélectionnée(s)`
          : 'Aucune personne sélectionnée';
      default:
        return '';
    }
  }, [form.audienceType, form.targetClassIds.length, form.targetRoles, form.targetUserIds.length, selectedClassNames, selectedContextClassName]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setStudentSearch('');
    setUserSearch('');
  };

  const openCompose = () => {
    resetForm();
    setComposeOpen(true);
  };

  const changeAudienceType = (value: AnnouncementAudienceType) => {
    setForm((previous) => ({
      ...previous,
      audienceType: value,
      targetRoles: [],
      targetClassIds: [],
      targetUserIds: [],
      contextClassId: '',
    }));
    setStudentSearch('');
    setUserSearch('');
  };

  const validateForm = (): string | null => {
    if (form.title.trim().length < 3) return 'Le titre doit contenir au moins 3 caractères.';
    if (!form.content.trim()) return 'Le message du communiqué est obligatoire.';
    if (form.audienceType === 'ROLES' && form.targetRoles.length === 0) return 'Choisissez au moins un rôle.';
    if (form.audienceType === 'CLASSES' && form.targetClassIds.length === 0) return 'Choisissez au moins une classe.';
    if (form.audienceType === 'STUDENTS') {
      if (!form.contextClassId) return 'Choisissez d’abord la classe de l’élève.';
      if (form.targetUserIds.length === 0) return 'Choisissez au moins un élève de cette classe.';
    }
    if (form.audienceType === 'USERS' && form.targetUserIds.length === 0) return 'Choisissez au moins une personne.';
    return null;
  };

  const prepareSend = () => {
    const problem = validateForm();
    if (problem) {
      toast.error(problem);
      return;
    }
    setConfirmOpen(true);
  };

  const submit = async () => {
    const problem = validateForm();
    if (problem) {
      toast.error(problem);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          content: form.content.trim(),
          category: form.category,
          priority: form.priority,
          audienceType: form.audienceType,
          targetRoles: form.audienceType === 'ROLES' ? form.targetRoles : [],
          targetClassIds: form.audienceType === 'CLASSES' ? form.targetClassIds : [],
          targetUserIds: form.audienceType === 'STUDENTS' || form.audienceType === 'USERS' ? form.targetUserIds : [],
          contextClassId: form.audienceType === 'STUDENTS' ? form.contextClassId : '',
          expiresAt: form.expiresAt || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible d’envoyer le communiqué.');

      toast.success(`Communiqué envoyé à ${data.recipientCount || 0} destinataire(s).`);
      setConfirmOpen(false);
      setComposeOpen(false);
      resetForm();
      setView('sent');
      void loadAnnouncements(true);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Erreur lors de l’envoi.');
    } finally {
      setSubmitting(false);
    }
  };

  const markRead = async (announcement: AnnouncementInfo) => {
    if (announcement.read || isReader) return;
    try {
      const response = await fetch(`/api/announcements/${announcement.id}/read`, { method: 'POST' });
      if (!response.ok) return;
      setAnnouncements((previous) => previous.map((item) => (
        item.id === announcement.id ? { ...item, read: true } : item
      )));
      setUnreadCount((previous) => Math.max(0, previous - 1));
      // Rafraîchit le compteur 📢 de l'en-tête (tous les rôles).
      window.dispatchEvent(new CustomEvent('gradeup-notification-read'));
    } catch {
      // La lecture sera réessayée à la prochaine ouverture.
    }
  };

  const openDetail = (announcement: AnnouncementInfo) => {
    setDetail(announcement);
    if (!announcement.read) void markRead(announcement);
  };

  const markAllRead = async () => {
    const unread = announcements.filter((item) => !item.read);
    if (unread.length === 0 || isReader) return;
    try {
      await Promise.all(unread.map((item) => fetch(`/api/announcements/${item.id}/read`, { method: 'POST' })));
      setAnnouncements((previous) => previous.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
      window.dispatchEvent(new CustomEvent('gradeup-notification-read'));
      toast.success('Tous les communiqués sont marqués comme lus.');
    } catch {
      toast.error('Impossible de marquer les communiqués comme lus.');
    }
  };

  const removeAnnouncement = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/announcements/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Suppression impossible.');
      toast.success('Communiqué retiré.');
      setDeleteTarget(null);
      if (detail?.id === deleteTarget.id) setDetail(null);
      void loadAnnouncements(true);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Suppression impossible.');
    } finally {
      setDeleting(false);
    }
  };

  const toggleStudent = (id: string) => {
    setForm((previous) => ({
      ...previous,
      targetUserIds: toggleValue(previous.targetUserIds, id),
    }));
  };

  const toggleAllVisibleStudents = () => {
    const visibleIds = studentsOfContextClass.map((item) => item.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => form.targetUserIds.includes(id));
    setForm((previous) => ({
      ...previous,
      targetUserIds: allSelected
        ? previous.targetUserIds.filter((id) => !visibleIds.includes(id))
        : [...new Set([...previous.targetUserIds, ...visibleIds])],
    }));
  };

  const togglePerson = (id: string) => {
    setForm((previous) => ({
      ...previous,
      targetUserIds: toggleValue(previous.targetUserIds, id),
    }));
  };

  const showSentView = isAdmin || isReader;
  const pageDescription = canManage
    ? 'Rédigez un communiqué et choisissez précisément qui doit le recevoir.'
    : isReader
      ? 'Consultez tous les communiqués de l’établissement en lecture seule.'
      : 'Retrouvez ici les communiqués qui vous sont adressés.';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-violet-50 p-6 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-violet-950/30">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-white shadow-sm dark:bg-slate-950">
              <Image src="/logo-gradeup.png" alt="GradeUp" width={34} height={34} className="size-8 object-contain" />
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <Megaphone className="size-6 text-blue-600" />
                Communiqués
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{pageDescription}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadAnnouncements(true)}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
            {canManage && (
              <Button onClick={openCompose} className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                <PenLine className="size-4" />
                Nouveau communiqué
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {showSentView ? (
          <Tabs value={view} onValueChange={(value) => setView(value as 'inbox' | 'sent')}>
            <TabsList>
              <TabsTrigger value="inbox" className="gap-2">
                <Bell className="size-4" />
                Boîte de réception
                {unreadCount > 0 && (
                  <Badge className="ml-1 bg-blue-600 px-1.5 text-[10px] text-white">{unreadCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="sent" className="gap-2">
                <Megaphone className="size-4" />
                {isAdmin ? 'Communiqués envoyés' : 'Tous les communiqués'}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : (
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bell className="size-4 text-blue-600" />
            Mes communiqués
            {unreadCount > 0 && <Badge className="bg-blue-600 text-white">{unreadCount} non lu(s)</Badge>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un communiqué…"
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toutes les catégories</SelectItem>
              {ANNOUNCEMENT_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>{ANNOUNCEMENT_CATEGORY_LABELS[category]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={unreadOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUnreadOnly((value) => !value)}
            className="gap-2"
          >
            <Eye className="size-4" />
            Non lus
          </Button>
          {!isReader && unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => void markAllRead()} className="gap-2">
              <CheckCheck className="size-4" />
              Tout marquer comme lu
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-red-700 dark:text-red-300">
            <ShieldAlert className="size-5 shrink-0" />
            <span className="flex-1">{error}</span>
            <Button variant="outline" size="sm" onClick={() => void loadAnnouncements()}>Réessayer</Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-muted/60">
              <Megaphone className="size-10 text-muted-foreground/60" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Aucun communiqué</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {view === 'sent'
                  ? 'Aucun communiqué n’a encore été envoyé.'
                  : 'Vous n’avez reçu aucun communiqué pour le moment.'}
              </p>
            </div>
            {canManage && view === 'sent' && (
              <Button onClick={openCompose} variant="outline" className="gap-2">
                <PenLine className="size-4" />
                Rédiger le premier communiqué
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((announcement) => (
            <div
              key={announcement.id}
              role="button"
              tabIndex={0}
              onClick={() => openDetail(announcement)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openDetail(announcement);
                }
              }}
              className={`cursor-pointer rounded-xl border p-4 transition-all hover:border-blue-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                announcement.read ? 'bg-card' : 'border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-white dark:bg-slate-950">
                  <Image src="/logo-gradeup.png" alt="GradeUp" width={26} height={26} className="size-6 object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {!announcement.read && <span className="size-2 rounded-full bg-blue-600" />}
                    <CategoryBadge category={announcement.category} />
                    <PriorityBadge priority={announcement.priority} />
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Users className="size-3" />
                      {announcement.audienceLabel || ANNOUNCEMENT_AUDIENCE_LABELS.ALL}
                    </Badge>
                    {canManage && (
                      <Badge variant="secondary" className="text-xs">
                        {announcement.readCount || 0}/{announcement.recipientCount || 0} lu(s)
                      </Badge>
                    )}
                    {announcement.expiresAt && new Date(announcement.expiresAt).getTime() < Date.now() && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">Expiré</Badge>
                    )}
                  </div>
                  <h3 className="text-base font-semibold leading-snug">{announcement.title}</h3>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {announcement.content}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <User className="size-3.5" />
                      {announcement.author?.fullName || 'Administration'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" />
                      {formatDate(announcement.publishedAt)}
                    </span>
                    {announcement.targetClassNames && announcement.targetClassNames.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <School className="size-3.5" />
                        {announcement.targetClassNames.join(', ')}
                      </span>
                    )}
                    {announcement.targetUserNames && announcement.targetUserNames.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5" />
                        {announcement.targetUserNames.slice(0, 3).join(', ')}
                        {announcement.targetUserNames.length > 3 ? ` +${announcement.targetUserNames.length - 3}` : ''}
                      </span>
                    )}
                  </div>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-red-600"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteTarget(announcement);
                    }}
                    aria-label="Retirer le communiqué"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Détail */}
      <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex size-10 items-center justify-center rounded-lg border bg-white dark:bg-slate-950">
                    <Image src="/logo-gradeup.png" alt="GradeUp" width={26} height={26} className="size-6 object-contain" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CategoryBadge category={detail.category} />
                    <PriorityBadge priority={detail.priority} />
                  </div>
                </div>
                <DialogTitle className="text-xl leading-snug">{detail.title}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <User className="size-3.5" />
                    {detail.author?.fullName || 'Administration'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {formatDate(detail.publishedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5" />
                    {detail.audienceLabel || 'Destinataires'}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <Separator />

              <div className="whitespace-pre-wrap text-sm leading-relaxed">{detail.content}</div>

              <Separator />

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Destinataires</p>
                  <p className="mt-1">{detail.recipientCount || 0} personne(s)</p>
                  {detail.targetClassNames && detail.targetClassNames.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">Classes : {detail.targetClassNames.join(', ')}</p>
                  )}
                  {detail.targetUserNames && detail.targetUserNames.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Personnes : {detail.targetUserNames.join(', ')}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Suivi</p>
                  <p className="mt-1">{canManage ? `${detail.readCount || 0} lecture(s)` : detail.read ? 'Lu' : 'Non lu'}</p>
                  {detail.expiresAt && (
                    <p className="mt-1 text-xs text-muted-foreground">Expire le {formatDate(detail.expiresAt)}</p>
                  )}
                </div>
              </div>

              <DialogFooter>
                {canManage && (
                  <Button
                    variant="outline"
                    className="gap-2 text-red-600 hover:text-red-700"
                    onClick={() => setDeleteTarget(detail)}
                  >
                    <Trash2 className="size-4" />
                    Retirer
                  </Button>
                )}
                <Button onClick={() => setDetail(null)}>Fermer</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Rédaction */}
      <Dialog open={composeOpen} onOpenChange={(open) => { setComposeOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="size-5 text-blue-600" />
              Nouveau communiqué
            </DialogTitle>
            <DialogDescription>
              Le communiqué apparaîtra dans l’interface des destinataires choisis, avec une notification GradeUp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="announcement-title">Titre *</Label>
              <Input
                id="announcement-title"
                value={form.title}
                maxLength={160}
                onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
                placeholder="Ex. Réunion des parents d’élèves"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="announcement-content">Message *</Label>
              <Textarea
                id="announcement-content"
                value={form.content}
                rows={7}
                maxLength={20000}
                onChange={(event) => setForm((previous) => ({ ...previous, content: event.target.value }))}
                placeholder="Rédigez ici le contenu complet du communiqué…"
                className="resize-y"
              />
              <p className="text-xs text-muted-foreground">{form.content.length} caractère(s)</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) => setForm((previous) => ({ ...previous, category: value as AnnouncementCategory }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ANNOUNCEMENT_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>{ANNOUNCEMENT_CATEGORY_LABELS[category]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priorité</Label>
                <Select
                  value={form.priority}
                  onValueChange={(value) => setForm((previous) => ({ ...previous, priority: value as AnnouncementPriority }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ANNOUNCEMENT_PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority}>{ANNOUNCEMENT_PRIORITY_LABELS[priority]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Date d’expiration (facultative)</Label>
              <Input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(event) => setForm((previous) => ({ ...previous, expiresAt: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Après cette date, le communiqué n’apparaît plus dans les boîtes de réception.</p>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label>Destinataires *</Label>
                  <p className="text-xs text-muted-foreground">Choisissez un groupe, une classe ou des personnes précises.</p>
                </div>
                <Select value={form.audienceType} onValueChange={(value) => changeAudienceType(value as AnnouncementAudienceType)}>
                  <SelectTrigger className="w-full sm:w-[230px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ANNOUNCEMENT_AUDIENCE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{ANNOUNCEMENT_AUDIENCE_LABELS[type]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {optionsLoading && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                  <RefreshCw className="size-4 animate-spin" />
                  Chargement des classes et des personnes…
                </div>
              )}

              {form.audienceType === 'ALL' && (
                <div className="flex items-start gap-3 rounded-lg border bg-blue-50/50 p-4 text-sm dark:bg-blue-950/20">
                  <Globe className="mt-0.5 size-5 shrink-0 text-blue-600" />
                  <div>
                    <p className="font-medium">Tout le monde</p>
                    <p className="text-muted-foreground">
                      Le communiqué sera envoyé à tous les comptes actifs de l’école : administration, professeurs,
                      élèves, parents, caisse et lecteurs.
                    </p>
                  </div>
                </div>
              )}

              {form.audienceType === 'ROLES' && (
                <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                  {ANNOUNCEMENT_ROLES.map((role) => {
                    const Icon = ROLE_ICONS[role] || User;
                    const count = activeUsers.filter((item) => item.role === role).length;
                    return (
                      <label key={role} className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50">
                        <Checkbox
                          checked={form.targetRoles.includes(role)}
                          onCheckedChange={() => setForm((previous) => ({
                            ...previous,
                            targetRoles: toggleValue(previous.targetRoles, role),
                          }))}
                        />
                        <Icon className="size-4 text-muted-foreground" />
                        <span className="flex-1 text-sm">{ANNOUNCEMENT_ROLE_LABELS[role]}</span>
                        <Badge variant="secondary" className="text-xs">{count}</Badge>
                      </label>
                    );
                  })}
                </div>
              )}

              {form.audienceType === 'CLASSES' && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Les élèves de chaque classe choisie et leurs parents rattachés recevront le communiqué.
                  </p>
                  <ScrollArea className="h-56 rounded-lg border p-2">
                    {classes.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">Aucune classe disponible.</p>
                    ) : (
                      <div className="space-y-1">
                        {classes.map((item) => (
                          <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50">
                            <Checkbox
                              checked={form.targetClassIds.includes(item.id)}
                              onCheckedChange={() => setForm((previous) => ({
                                ...previous,
                                targetClassIds: toggleValue(previous.targetClassIds, item.id),
                              }))}
                            />
                            <School className="size-4 text-muted-foreground" />
                            <span className="flex-1 text-sm">{classDisplayName(item)}</span>
                            <Badge variant="secondary" className="text-xs">
                              {item._count?.enrollments || 0} élève(s)
                            </Badge>
                          </label>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}

              {form.audienceType === 'STUDENTS' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="announcement-class">Classe de l’élève *</Label>
                    <Select
                      value={form.contextClassId}
                      onValueChange={(value) => setForm((previous) => ({
                        ...previous,
                        contextClassId: value,
                        targetUserIds: [],
                      }))}
                    >
                      <SelectTrigger id="announcement-class">
                        <SelectValue placeholder="Choisir d’abord la classe" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((item) => (
                          <SelectItem key={item.id} value={item.id}>{classDisplayName(item)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {form.contextClassId ? (
                    <>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={studentSearch}
                            onChange={(event) => setStudentSearch(event.target.value)}
                            placeholder="Rechercher un élève par nom ou matricule…"
                            className="pl-9"
                          />
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={toggleAllVisibleStudents}>
                          {studentsOfContextClass.length > 0 && studentsOfContextClass.every((item) => form.targetUserIds.includes(item.id))
                            ? 'Tout désélectionner'
                            : 'Tout sélectionner'}
                        </Button>
                      </div>
                      <ScrollArea className="h-56 rounded-lg border p-2">
                        {studentsOfContextClass.length === 0 ? (
                          <p className="p-3 text-sm text-muted-foreground">Aucun élève trouvé dans cette classe.</p>
                        ) : (
                          <div className="space-y-1">
                            {studentsOfContextClass.map((student) => (
                              <label key={student.id} className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50">
                                <Checkbox
                                  checked={form.targetUserIds.includes(student.id)}
                                  onCheckedChange={() => toggleStudent(student.id)}
                                />
                                <User className="size-4 text-muted-foreground" />
                                <span className="flex-1 text-sm">
                                  {student.fullName}
                                  {student.matricule ? <span className="ml-2 text-xs text-muted-foreground">{student.matricule}</span> : null}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                      <p className="text-xs text-muted-foreground">
                        {form.targetUserIds.length} élève(s) sélectionné(s). Les parents rattachés seront également notifiés.
                      </p>
                    </>
                  ) : (
                    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      Choisissez d’abord la classe : la liste des élèves de cette classe s’affichera ensuite.
                    </p>
                  )}
                </div>
              )}

              {form.audienceType === 'USERS' && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={userSearch}
                      onChange={(event) => setUserSearch(event.target.value)}
                      placeholder="Rechercher une personne (nom, matricule, rôle)…"
                      className="pl-9"
                    />
                  </div>
                  <ScrollArea className="h-64 rounded-lg border p-2">
                    {filteredPeople.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">Aucune personne trouvée.</p>
                    ) : (
                      <div className="space-y-1">
                        {filteredPeople.map((person) => {
                          const Icon = ROLE_ICONS[person.role] || User;
                          return (
                            <label key={person.id} className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50">
                              <Checkbox
                                checked={form.targetUserIds.includes(person.id)}
                                onCheckedChange={() => togglePerson(person.id)}
                              />
                              <Icon className="size-4 text-muted-foreground" />
                              <span className="flex-1 text-sm">{person.fullName}</span>
                              <Badge variant="outline" className="text-xs">{person.role}</Badge>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                  <p className="text-xs text-muted-foreground">
                    {form.targetUserIds.length} personne(s) sélectionnée(s). Vous pouvez en choisir 2, 3 ou davantage.
                  </p>
                </div>
              )}

              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-sm font-medium">Résumé de l’envoi</p>
                <p className="mt-1 text-sm text-muted-foreground">{audienceSummary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Estimation : {estimatedRecipients} destinataire(s)
                  {(form.audienceType === 'CLASSES' || form.audienceType === 'STUDENTS') ? ' (hors parents rattachés)' : ''}.
                  Le nombre exact est calculé par le serveur à l’envoi.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Annuler</Button>
            <Button onClick={prepareSend} className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
              <Send className="size-4" />
              Vérifier et envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation d'envoi */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Envoyer ce communiqué ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p><span className="font-medium text-foreground">Titre :</span> {form.title}</p>
                <p><span className="font-medium text-foreground">Destinataires :</span> {audienceSummary}</p>
                <p><span className="font-medium text-foreground">Estimation :</span> {estimatedRecipients} destinataire(s)</p>
                <p className="text-muted-foreground">
                  Une notification avec le logo GradeUp sera envoyée. Le communiqué restera consultable dans les interfaces des destinataires.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Retour</AlertDialogCancel>
            <AlertDialogAction disabled={submitting} onClick={(event) => { event.preventDefault(); void submit(); }}>
              {submitting ? 'Envoi en cours…' : 'Envoyer maintenant'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation de retrait */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer ce communiqué ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleteTarget?.title} » disparaîtra des interfaces. Cette action est tracée dans le journal d’audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => { event.preventDefault(); void removeAnnouncement(); }}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Retrait…' : 'Retirer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
