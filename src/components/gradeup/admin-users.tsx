'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAppStore } from '@/lib/store';
import { buildAdminUserSchema, type AdminUserFormValues } from '@/lib/forms/schemas';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Users,
  GraduationCap,
  UserCheck,
  Shield,
  UserCog,
  UsersRound,
  UserPlus,
  Power,
  PowerOff,
  Download,
  Upload,
  Key,
  Copy,
  Check,
  FileSpreadsheet,
  AlertTriangle,
  Camera,
  X,
  RefreshCw,
  Filter,
  CheckSquare,
  Square,
} from 'lucide-react';
import { toast } from 'sonner';
import { compressImage } from '@/lib/image-compress';

interface UserItem {
  id: string;
  fullName: string;
  email: string;
  role: string;
  active?: boolean;
  gender?: string;
  birthDate?: string;
  specialty?: string;
  phone?: string;
  matricule?: string;
  parentCode?: string;
  photoUrl?: string;
  classEnrollments?: Array<{ class: { id: string; name: string } }>;
  isTitulaire?: boolean;
  titulaireClassIds?: string[];
  parentId?: string;
  parent?: { id: string; fullName: string };
}

interface ClassItem {
  id: string;
  name: string;
}

const roleLabels: Record<string, string> = {
  ADMIN: 'Administrateur',
  TEACHER: 'Professeur',
  STUDENT: 'Élève',
  PARENT: 'Parent',
};

const roleColors: Record<string, string> = {
  ADMIN: 'bg-blue-100 text-blue-700 border-blue-200',
  TEACHER: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  STUDENT: 'bg-purple-100 text-purple-700 border-purple-200',
  PARENT: 'bg-orange-100 text-orange-700 border-orange-200',
};

const roleAvatarColors: Record<string, string> = {
  ADMIN: 'bg-blue-500',
  TEACHER: 'bg-emerald-500',
  STUDENT: 'bg-purple-500',
  PARENT: 'bg-orange-500',
};

interface CsvRowValidation {
  row: number;
  fullName: string;
  email: string;
  role: string;
  gender: string;
  birthDate: string;
  phone?: string;
  className?: string;
  classId?: string;
  specialty?: string;
  isValid: boolean;
  errors: string[];
}

export default function AdminUsers() {
  const { user } = useAppStore();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [parents, setParents] = useState<{ id: string; fullName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  // Filtres
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');

  // Sélection groupée
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [batchActionLoading, setBatchActionLoading] = useState(false);

  // Dialogues
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isEdit, setIsEdit] = useState(false);

  // Upload photo
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Réinitialisation mot de passe
  const [resetPwdDialogOpen, setResetPwdDialogOpen] = useState(false);
  const [targetUserForPwd, setTargetUserForPwd] = useState<UserItem | null>(null);
  const [customPassword, setCustomPassword] = useState('');
  const [generatedTempPassword, setGeneratedTempPassword] = useState('');
  const [resettingPwd, setResettingPwd] = useState(false);
  const [pwdCopied, setPwdCopied] = useState(false);

  // Import Excel/CSV
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importRows, setImportRows] = useState<CsvRowValidation[]>([]);
  const [importing, setImporting] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Formulaire unifié (react-hook-form + zod)
  const form = useForm<AdminUserFormValues>({
    resolver: (values, context, options) =>
      zodResolver(buildAdminUserSchema(isEdit))(values, context, options),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      role: 'STUDENT',
      gender: '',
      birthDate: '',
      specialty: '',
      phone: '',
      className: '',
      classId: '',
      parentId: '',
      isTitulaire: false,
      titulaireClassIds: [],
    },
  });

  const watchedRole = form.watch('role');
  const watchedGender = form.watch('gender');
  const watchedIsTitulaire = form.watch('isTitulaire');
  const watchedTitulaireClassIds = form.watch('titulaireClassIds');

  const fetchUsers = useCallback(async () => {
    if (!user?.schoolId) return;
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsOffline(true);
        const { getLocalDB } = await import('@/lib/offline/db');
        const db = getLocalDB();
        const local = await db.users
          .where('schoolId')
          .equals(user.schoolId)
          .filter((u) => !u.deletedAt)
          .toArray();
        setUsers(local as any);
        setLoading(false);
        return;
      }

      let url = `/api/users?schoolId=${user.schoolId}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.users) ? data.users : [];
        setUsers(list);
        setIsOffline(false);
      } else {
        throw new Error('Erreur réseau');
      }
    } catch {
      setIsOffline(true);
      try {
        const { getLocalDB } = await import('@/lib/offline/db');
        const db = getLocalDB();
        const local = await db.users
          .where('schoolId')
          .equals(user?.schoolId || '')
          .filter((u) => !u.deletedAt)
          .toArray();
        if (local.length > 0) setUsers(local as any);
      } catch {
        // Ignorer
      }
    } finally {
      setLoading(false);
    }
  }, [user?.schoolId]);

  const fetchClasses = useCallback(async () => {
    if (!user?.schoolId) return;
    try {
      const res = await fetch(`/api/classes?schoolId=${user.schoolId}`);
      if (res.ok) {
        const data = await res.json();
        setClasses(Array.isArray(data.classes) ? data.classes : []);
      }
    } catch {
      try {
        const { getLocalDB } = await import('@/lib/offline/db');
        const local = await getLocalDB().classes.where('schoolId').equals(user.schoolId).toArray();
        if (local.length > 0) setClasses(local as any);
      } catch {
        // Ignorer
      }
    }
  }, [user?.schoolId]);

  const fetchParents = useCallback(async () => {
    if (!user?.schoolId) return;
    try {
      const res = await fetch(`/api/users?schoolId=${user.schoolId}&role=PARENT`);
      if (res.ok) {
        const data = await res.json();
        setParents(Array.isArray(data.users) ? data.users : []);
      }
    } catch {
      // Ignorer
    }
  }, [user?.schoolId]);

  useEffect(() => {
    if (user?.schoolId) {
      setLoading(true);
      fetchUsers();
      fetchClasses();
      fetchParents();
    }
  }, [fetchUsers, fetchClasses, fetchParents, user?.schoolId]);

  // Réinitialiser le formulaire
  const resetForm = () => {
    form.reset({
      fullName: '',
      email: '',
      password: '',
      role: 'STUDENT',
      gender: '',
      birthDate: '',
      specialty: '',
      phone: '',
      className: '',
      classId: '',
      parentId: '',
      isTitulaire: false,
      titulaireClassIds: [],
    });
    setPhotoPreview('');
    setEditingUser(null);
  };

  const openCreateDialog = () => {
    setIsEdit(false);
    resetForm();
    form.clearErrors();
    setDialogOpen(true);
  };

  const openEditDialog = (u: UserItem) => {
    setIsEdit(true);
    setEditingUser(u);
    form.clearErrors();
    setPhotoPreview(u.photoUrl || '');
    form.reset({
      fullName: u.fullName,
      email: u.email || '',
      password: '',
      role: (u.role as AdminUserFormValues['role']) || 'STUDENT',
      gender: u.gender === 'F' || u.gender === 'M' ? u.gender : '',
      birthDate: u.birthDate || '',
      specialty: u.specialty || '',
      phone: u.phone || '',
      className: u.classEnrollments?.[0]?.class?.name || '',
      classId: u.classEnrollments?.[0]?.class?.id || '',
      parentId: u.parentId || '',
      isTitulaire: u.isTitulaire || false,
      titulaireClassIds: u.titulaireClassIds || [],
    });
    setDialogOpen(true);
  };

  // Upload photo avec compression
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const compressed = await compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.85 });
      const formData = new FormData();
      formData.append('photo', compressed);
      formData.append('updateUser', editingUser ? 'true' : 'false');
      if (editingUser) formData.append('userId', editingUser.id);

      const res = await fetch('/api/upload/photo', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Échec du téléversement de la photo');
      const data = await res.json();
      setPhotoPreview(data.url);
      toast.success('Photo chargée avec succès');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l’upload');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const onValidSubmit = async (data: AdminUserFormValues) => {
    setSubmitting(true);
    try {
      if (editingUser) {
        const body: Record<string, unknown> = {
          schoolId: user?.schoolId,
          fullName: data.fullName,
          email: data.email,
          role: data.role,
          gender: data.gender,
          birthDate: data.birthDate,
          specialty: data.specialty,
          phone: data.phone,
          classId: data.role === 'STUDENT' ? data.classId : undefined,
          isTitulaire: data.isTitulaire,
          titulaireClassIds: data.isTitulaire ? data.titulaireClassIds : [],
          photoUrl: photoPreview,
        };
        if (data.password) body.password = data.password;
        if (data.role === 'STUDENT' && data.parentId) body.parentId = data.parentId;

        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Erreur lors de la modification');
        toast.success('Utilisateur modifié avec succès');
      } else {
        const body: Record<string, unknown> = {
          schoolId: user?.schoolId,
          fullName: data.fullName,
          email: data.email,
          password: data.password,
          role: data.role,
          gender: data.gender,
          birthDate: data.birthDate,
          specialty: data.specialty,
          phone: data.phone,
          classId: data.role === 'STUDENT' ? data.classId : undefined,
          isTitulaire: data.isTitulaire,
          titulaireClassIds: data.isTitulaire ? data.titulaireClassIds : [],
          photoUrl: photoPreview,
        };
        if (data.role === 'STUDENT' && data.parentId) body.parentId = data.parentId;

        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Erreur lors de la création');
        toast.success('Utilisateur créé avec succès');
      }

      setDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l’opération');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = form.handleSubmit(onValidSubmit);

  // Soft delete individuel
  const handleDelete = async () => {
    if (!deletingUser) return;
    try {
      const res = await fetch(`/api/users/${deletingUser.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success('Utilisateur supprimé (archivé)');
      setDeleteDialogOpen(false);
      setDeletingUser(null);
      fetchUsers();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la suppression');
    }
  };

  // Bascule statut actif/inactif
  const toggleActive = async (u: UserItem) => {
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, active: !u.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success(u.active ? 'Compte désactivé' : 'Compte activé');
      fetchUsers();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l’opération');
    }
  };

  // Actions groupées (batch)
  const handleBatchAction = async (action: 'activate' | 'deactivate' | 'delete') => {
    if (selectedUserIds.length === 0) return;
    setBatchActionLoading(true);
    try {
      const res = await fetch('/api/users/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userIds: selectedUserIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors du traitement groupé');
      toast.success(data.message || 'Action groupée appliquée avec succès');
      setSelectedUserIds([]);
      setBatchDeleteDialogOpen(false);
      fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Échec de l’action groupée');
    } finally {
      setBatchActionLoading(false);
    }
  };

  // Réinitialiser le mot de passe
  const handleResetPassword = async () => {
    if (!targetUserForPwd) return;
    setResettingPwd(true);
    try {
      const res = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUserForPwd.id,
          newPassword: customPassword.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Échec de la réinitialisation');
      setGeneratedTempPassword(data.temporaryPassword || customPassword);
      toast.success(data.message || 'Mot de passe réinitialisé');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur réinitialisation');
    } finally {
      setResettingPwd(false);
    }
  };

  // Export CSV complet avec BOM UTF-8
  const exportCSV = () => {
    if (filteredUsers.length === 0) {
      toast.error('Aucun utilisateur à exporter');
      return;
    }
    const headers = ['Nom Complet', 'Email', 'Rôle', 'Sexe', 'Matricule', 'Code Parent', 'Date Naissance', 'Téléphone', 'Classe', 'Statut'];
    const rows = filteredUsers.map((u) => [
      u.fullName,
      u.email || '',
      u.role,
      u.gender || '',
      u.matricule || '',
      u.parentCode || '',
      u.birthDate || '',
      u.phone || '',
      u.classEnrollments?.map((e) => e.class.name).join(' / ') || '',
      u.active !== false ? 'Actif' : 'Inactif',
    ]);
    const csvContent = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `utilisateurs-gradeup-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filteredUsers.length} utilisateur(s) exporté(s)`);
  };

  // Télécharger modèle CSV
  const downloadCsvTemplate = () => {
    const template = [
      ['Nom Complet', 'Email', 'Rôle (STUDENT/TEACHER/PARENT)', 'Sexe (M/F)', 'Date Naissance (YYYY-MM-DD)', 'Téléphone', 'Classe', 'Spécialité (Prof)'],
      ['Kabasele Patrick', 'patrick.kabasele@ecole.cd', 'STUDENT', 'M', '2010-05-14', '+243990000001', '6ème A', ''],
      ['Mwamba Solange', 'solange.mwamba@ecole.cd', 'TEACHER', 'F', '1988-11-20', '+243810000002', '', 'Mathématiques'],
    ]
      .map((r) => r.map((c) => `"${c}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\uFEFF' + template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-import-utilisateurs.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Parser de fichier CSV
  const handleCsvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      toast.error('Le fichier CSV est vide ou ne contient pas d’en-tête.');
      return;
    }

    const separator = lines[0].includes(';') ? ';' : ',';
    const parsedRows: CsvRowValidation[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i]
        .split(separator)
        .map((p) => p.replace(/^"|"$/g, '').trim());

      const fullName = parts[0] || '';
      const email = parts[1] || '';
      const rawRole = (parts[2] || 'STUDENT').toUpperCase();
      const role = ['STUDENT', 'TEACHER', 'PARENT', 'ADMIN', 'CAISSIER'].includes(rawRole) ? rawRole : 'STUDENT';
      const gender = (parts[3] || '').toUpperCase();
      const birthDate = parts[4] || '';
      const phone = parts[5] || '';
      const className = parts[6] || '';
      const specialty = parts[7] || '';
      const matchedClass = classes.find((item) => item.name.toLowerCase() === className.toLowerCase());

      const errors: string[] = [];
      if (fullName.length < 3) errors.push('Nom trop court (min 3 car.)');
      if (!email.includes('@')) errors.push('Email invalide');
      if (gender !== 'M' && gender !== 'F') errors.push('Sexe obligatoire (M ou F)');
      if ((role === 'STUDENT' || role === 'TEACHER') && !birthDate) errors.push('Date de naissance requise');
      if (role === 'STUDENT' && !matchedClass) errors.push(className ? 'Classe inconnue dans cet établissement' : 'Classe requise pour un élève');
      if (role === 'TEACHER' && !phone.trim()) errors.push('Téléphone requis pour un professeur');
      if (role === 'TEACHER' && !specialty.trim()) errors.push('Spécialité requise pour un professeur');

      parsedRows.push({
        row: i,
        fullName,
        email,
        role,
        gender: gender === 'F' || gender === 'M' ? gender : '',
        birthDate,
        phone,
        className,
        classId: matchedClass?.id,
        specialty,
        isValid: errors.length === 0,
        errors,
      });
    }

    setImportRows(parsedRows);
    setImportDialogOpen(true);
    e.target.value = '';
  };

  // Exécuter l'importation réelle
  const executeBatchImport = async () => {
    const validOnes = importRows.filter((r) => r.isValid);
    if (validOnes.length === 0) {
      toast.error('Aucune ligne valide à importer');
      return;
    }

    setImporting(true);
    let successCount = 0;
    let failCount = 0;

    for (const r of validOnes) {
      try {
        const body: Record<string, unknown> = {
          schoolId: user?.schoolId,
          fullName: r.fullName,
          email: r.email,
          password: 'Pass' + Math.floor(1000 + Math.random() * 9000) + '!',
          role: r.role,
          gender: r.gender,
          birthDate: r.birthDate,
          phone: r.phone || '',
          classId: r.role === 'STUDENT' ? r.classId : undefined,
          specialty: r.specialty || '',
        };

        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (res.ok) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    setImporting(false);
    setImportDialogOpen(false);
    setImportRows([]);
    toast.success(`Import terminé : ${successCount} utilisateur(s) créé(s)${failCount > 0 ? `, ${failCount} échec(s)` : ''}`);
    fetchUsers();
  };

  // Filtrage combiné (Rôle, Classe, Statut, Recherche)
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Filtre rôle
      if (activeTab !== 'ALL' && u.role !== activeTab) return false;

      // Filtre statut
      if (selectedStatusFilter === 'active' && u.active === false) return false;
      if (selectedStatusFilter === 'inactive' && u.active !== false) return false;

      // Filtre classe
      if (selectedClassFilter !== 'ALL') {
        const isInClass = u.classEnrollments?.some((e) => e.class.id === selectedClassFilter);
        const isTitular = u.titulaireClassIds?.includes(selectedClassFilter);
        if (!isInClass && !isTitular) return false;
      }

      // Filtre texte
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = u.fullName.toLowerCase().includes(q);
        const matchEmail = (u.email || '').toLowerCase().includes(q);
        const matchMatricule = (u.matricule || '').toLowerCase().includes(q);
        const matchParentCode = (u.parentCode || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchMatricule && !matchParentCode) return false;
      }

      return true;
    });
  }, [users, activeTab, selectedStatusFilter, selectedClassFilter, searchQuery]);

  const getInitials = (name: string) => {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const isAllSelected = filteredUsers.length > 0 && filteredUsers.every((u) => selectedUserIds.includes(u.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(filteredUsers.map((u) => u.id));
    }
  };

  const toggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const copyParentCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
    toast.success(`Code parent copié : ${code}`);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Page Header */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 p-5 lg:p-7 text-white shadow-lg shadow-blue-500/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold">Gestion des utilisateurs</h1>
              {isOffline && (
                <Badge variant="outline" className="bg-amber-400/20 text-amber-200 border-amber-300/40 text-xs font-semibold">
                  Hors ligne
                </Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-blue-100 mt-1">
              Élèves, professeurs, parents et administrateurs ({users.length} membres)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer">
              <input type="file" accept=".csv,.txt" onChange={handleCsvFileUpload} className="hidden" />
              <Button
                variant="outline"
                size="sm"
                asChild
                className="bg-white/10 hover:bg-white/20 border-white/20 text-white min-h-[44px]"
              >
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  Importer
                </span>
              </Button>
            </label>
            <Button
              onClick={exportCSV}
              variant="outline"
              size="sm"
              className="bg-white/10 hover:bg-white/20 border-white/20 text-white min-h-[44px]"
            >
              <Download className="h-4 w-4 mr-2" />
              Exporter
            </Button>
            <Button
              onClick={openCreateDialog}
              className="bg-white text-blue-700 hover:bg-blue-50 font-bold shadow-md min-h-[44px]"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Ajouter
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs par rôle */}
      <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setSelectedUserIds([]); }}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl bg-muted/70 p-1 rounded-xl">
          <TabsTrigger value="ALL" className="text-xs font-semibold">
            Tous ({users.length})
          </TabsTrigger>
          <TabsTrigger value="STUDENT" className="text-xs font-semibold">
            Élèves ({users.filter((u) => u.role === 'STUDENT').length})
          </TabsTrigger>
          <TabsTrigger value="TEACHER" className="text-xs font-semibold">
            Profs ({users.filter((u) => u.role === 'TEACHER').length})
          </TabsTrigger>
          <TabsTrigger value="PARENT" className="text-xs font-semibold">
            Parents ({users.filter((u) => u.role === 'PARENT').length})
          </TabsTrigger>
          <TabsTrigger value="ADMIN" className="text-xs font-semibold">
            Admins ({users.filter((u) => u.role === 'ADMIN').length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Barre de filtres combinés */}
      <Card className="rounded-2xl border shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Recherche globale */}
            <div className="sm:col-span-6 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, email, matricule, code parent..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-11 rounded-xl bg-background"
              />
            </div>

            {/* Filtre par classe */}
            <div className="sm:col-span-3">
              <Select value={selectedClassFilter} onValueChange={setSelectedClassFilter}>
                <SelectTrigger className="h-11 rounded-xl bg-background">
                  <SelectValue placeholder="Toutes les classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Toutes les classes</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtre par statut */}
            <div className="sm:col-span-3">
              <Select value={selectedStatusFilter} onValueChange={setSelectedStatusFilter}>
                <SelectTrigger className="h-11 rounded-xl bg-background">
                  <SelectValue placeholder="Tous les statuts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tous les statuts</SelectItem>
                  <SelectItem value="active">Actifs uniquement</SelectItem>
                  <SelectItem value="inactive">Inactifs uniquement</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Barre d'actions groupées si éléments sélectionnés */}
          {selectedUserIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-blue-600" />
                <span className="text-xs sm:text-sm font-semibold text-blue-800 dark:text-blue-300">
                  {selectedUserIds.length} utilisateur(s) sélectionné(s)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBatchAction('activate')}
                  disabled={batchActionLoading}
                  className="h-9 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                >
                  <Power className="w-3.5 h-3.5 mr-1" />
                  Activer
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBatchAction('deactivate')}
                  disabled={batchActionLoading}
                  className="h-9 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  <PowerOff className="w-3.5 h-3.5 mr-1" />
                  Désactiver
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setBatchDeleteDialogOpen(true)}
                  disabled={batchActionLoading}
                  className="h-9 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Supprimer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedUserIds([])}
                  className="h-9 text-xs text-muted-foreground"
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Liste des utilisateurs */}
      <Card className="rounded-2xl border shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted/60 flex items-center justify-center mb-3">
                <Users className="h-8 w-8 text-muted-foreground/60" />
              </div>
              <h3 className="text-base font-semibold mb-1">Aucun utilisateur trouvé</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                Modifiez vos critères de recherche ou ajoutez un nouvel utilisateur à l&apos;école.
              </p>
              <Button onClick={openCreateDialog} className="min-h-[44px]">
                <UserPlus className="h-4 w-4 mr-2" />
                Ajouter un utilisateur
              </Button>
            </div>
          ) : (
            <>
              {/* Table pour grands écrans */}
              <div className="hidden md:block">
                <Table className="text-xs sm:text-sm">
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="w-12 text-center">
                        <button onClick={toggleSelectAll} className="p-1">
                          {isAllSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                        </button>
                      </TableHead>
                      <TableHead>Utilisateur</TableHead>
                      <TableHead>Rôle & Sexe</TableHead>
                      <TableHead>Matricule / Identifiant</TableHead>
                      <TableHead>Classe / Spécialité</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => {
                      const isSelected = selectedUserIds.includes(u.id);
                      return (
                        <TableRow key={u.id} className={`hover:bg-muted/30 transition-colors ${isSelected ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}>
                          <TableCell className="text-center">
                            <button onClick={() => toggleSelectUser(u.id)} className="p-1">
                              {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {u.photoUrl ? (
                                <img src={u.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover border" />
                              ) : (
                                <div className={`w-9 h-9 rounded-full ${roleAvatarColors[u.role] || 'bg-gray-500'} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                                  {getInitials(u.fullName)}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-semibold text-foreground truncate">{u.fullName}</p>
                                <p className="text-xs text-muted-foreground truncate">{u.email || '—'}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className={roleColors[u.role] || ''}>
                                {roleLabels[u.role] || u.role}
                              </Badge>
                              {u.gender && (
                                <Badge variant="secondary" className="text-[10px] px-1.5">
                                  {u.gender === 'F' ? 'F' : 'M'}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              {u.matricule ? (
                                <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded">
                                  {u.matricule}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                              {u.role === 'STUDENT' && u.parentCode && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className="text-[10px] text-muted-foreground font-mono">Parent: {u.parentCode}</span>
                                  <button onClick={() => copyParentCode(u.parentCode!, u.id)} className="text-blue-600 hover:text-blue-800">
                                    {copiedCodeId === u.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs">
                              {u.classEnrollments && u.classEnrollments.length > 0 ? (
                                <span className="font-medium text-foreground">{u.classEnrollments.map((e) => e.class.name).join(', ')}</span>
                              ) : u.role === 'TEACHER' && u.specialty ? (
                                <span className="font-medium text-foreground">{u.specialty}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                              {u.isTitulaire && <p className="text-[10px] text-emerald-600 font-semibold">Titulaire</p>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <button
                              onClick={() => toggleActive(u)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                                u.active !== false
                                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                  : 'bg-red-100 text-red-700 hover:bg-red-200'
                              }`}
                            >
                              {u.active !== false ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                              {u.active !== false ? 'Actif' : 'Inactif'}
                            </button>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Réinitialiser mot de passe"
                                className="h-8 w-8 hover:bg-amber-50 hover:text-amber-700"
                                onClick={() => {
                                  setTargetUserForPwd(u);
                                  setCustomPassword('');
                                  setGeneratedTempPassword('');
                                  setResetPwdDialogOpen(true);
                                }}
                              >
                                <Key className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Modifier"
                                className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600"
                                onClick={() => openEditDialog(u)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Supprimer"
                                className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                                onClick={() => {
                                  setDeletingUser(u);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Vue Mobile-First (Cards pour écrans < 768px) */}
              <div className="md:hidden divide-y">
                {filteredUsers.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <div key={u.id} className={`p-4 space-y-3 transition-colors ${isSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <button onClick={() => toggleSelectUser(u.id)} className="p-1 -ml-1">
                            {isSelected ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-muted-foreground" />}
                          </button>
                          {u.photoUrl ? (
                            <img src={u.photoUrl} alt="" className="w-11 h-11 rounded-full object-cover border shrink-0" />
                          ) : (
                            <div className={`w-11 h-11 rounded-full ${roleAvatarColors[u.role] || 'bg-gray-500'} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                              {getInitials(u.fullName)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-foreground truncate">{u.fullName}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email || '—'}</p>
                            {u.matricule && (
                              <p className="font-mono text-[11px] font-semibold text-blue-600 mt-0.5">{u.matricule}</p>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className={`shrink-0 ${roleColors[u.role] || ''}`}>
                          {roleLabels[u.role] || u.role}
                        </Badge>
                      </div>

                      {/* Infos complémentaires */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                        <div className="space-y-0.5">
                          {u.classEnrollments && u.classEnrollments.length > 0 ? (
                            <p className="font-semibold text-foreground">Classe : {u.classEnrollments.map((e) => e.class.name).join(', ')}</p>
                          ) : u.specialty ? (
                            <p className="font-semibold text-foreground">Spécialité : {u.specialty}</p>
                          ) : null}
                          {u.parentCode && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <span>Code parent : <strong className="font-mono text-foreground">{u.parentCode}</strong></span>
                              <button onClick={() => copyParentCode(u.parentCode!, u.id)} className="p-1 text-blue-600">
                                {copiedCodeId === u.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => toggleActive(u)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors min-h-[36px] ${
                            u.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {u.active !== false ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                          {u.active !== false ? 'Actif' : 'Inactif'}
                        </button>
                      </div>

                      {/* Actions tactiles mobiles (>= 44px) */}
                      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-dashed">
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] text-xs gap-1"
                          onClick={() => {
                            setTargetUserForPwd(u);
                            setCustomPassword('');
                            setGeneratedTempPassword('');
                            setResetPwdDialogOpen(true);
                          }}
                        >
                          <Key className="w-3.5 h-3.5 text-amber-600" />
                          Mot de passe
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] text-xs gap-1"
                          onClick={() => openEditDialog(u)}
                        >
                          <Pencil className="w-3.5 h-3.5 text-blue-600" />
                          Modifier
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => {
                            setDeletingUser(u);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Supprimer
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialogue Créer / Modifier Utilisateur */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingUser ? <UserCog className="h-5 w-5 text-blue-600" /> : <UserPlus className="h-5 w-5 text-blue-600" />}
              {editingUser ? 'Modifier l’utilisateur' : 'Créer un nouvel utilisateur'}
            </DialogTitle>
            <DialogDescription>
              Tous les champs marqués d&apos;un astérisque (*) sont obligatoires.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {/* Zone photo / avatar */}
            <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/40 border">
              <div className="relative">
                {photoPreview ? (
                  <img src={photoPreview} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-blue-500" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xl border">
                    <Camera className="w-7 h-7" />
                  </div>
                )}
                {uploadingPhoto && (
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-white animate-spin" />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Photo de profil / ID</Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="min-h-[38px] text-xs"
                  >
                    Choisir une photo
                  </Button>
                  {photoPreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPhotoPreview('')}
                      className="min-h-[38px] text-xs text-red-600 hover:bg-red-50"
                    >
                      Supprimer
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <FormField
              label="Nom complet"
              required
              placeholder="Ex: Jean-Baptiste Kalala"
              error={form.formState.errors.fullName?.message}
              {...form.register('fullName')}
            />

            <FormField
              label="Email"
              type="email"
              required
              placeholder="utilisateur@ecole.cd"
              error={form.formState.errors.email?.message}
              {...form.register('email')}
            />

            {!isEdit && (
              <FormField
                label="Mot de passe initial"
                type="password"
                required
                placeholder="Minimum 8 caractères"
                error={form.formState.errors.password?.message}
                {...form.register('password')}
              />
            )}

            {/* Rôle */}
            <div className="space-y-1.5">
              <Label>Rôle dans l&apos;établissement *</Label>
              <Select
                value={watchedRole}
                onValueChange={(v) => form.setValue('role', v as AdminUserFormValues['role'], { shouldValidate: true })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STUDENT">Élève</SelectItem>
                  <SelectItem value="TEACHER">Professeur</SelectItem>
                  <SelectItem value="PARENT">Parent</SelectItem>
                  <SelectItem value="ADMIN">Administrateur</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sexe M / F */}
            <div className="space-y-1.5">
              <Label>Sexe *</Label>
              <RadioGroup
                value={watchedGender}
                onValueChange={(v) => form.setValue('gender', v as 'M' | 'F', { shouldValidate: true })}
                className="grid grid-cols-2 gap-2"
              >
                <Label
                  htmlFor="user-gender-m"
                  className={`flex items-center justify-center gap-2 h-11 rounded-xl border font-semibold text-sm cursor-pointer transition-all ${
                    watchedGender === 'M' ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40' : 'border-border/60 hover:bg-muted'
                  }`}
                >
                  <RadioGroupItem value="M" id="user-gender-m" className="sr-only" />
                  Masculin (M)
                </Label>
                <Label
                  htmlFor="user-gender-f"
                  className={`flex items-center justify-center gap-2 h-11 rounded-xl border font-semibold text-sm cursor-pointer transition-all ${
                    watchedGender === 'F' ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40' : 'border-border/60 hover:bg-muted'
                  }`}
                >
                  <RadioGroupItem value="F" id="user-gender-f" className="sr-only" />
                  Féminin (F)
                </Label>
              </RadioGroup>
              {form.formState.errors.gender && (
                <p className="text-xs text-red-600">{form.formState.errors.gender.message}</p>
              )}
            </div>

            {/* Date de naissance */}
            {(watchedRole === 'STUDENT' || watchedRole === 'TEACHER') && (
              <FormField
                label="Date de naissance"
                required
                type="date"
                error={form.formState.errors.birthDate?.message}
                {...form.register('birthDate')}
              />
            )}

            {/* Champs spécifiques Professeur */}
            {watchedRole === 'TEACHER' && (
              <>
                <FormField
                  label="Spécialité / Discipline"
                  required
                  placeholder="Ex: Mathématiques, Physique"
                  error={form.formState.errors.specialty?.message}
                  {...form.register('specialty')}
                />
                <FormField
                  label="Numéro de téléphone"
                  required
                  type="tel"
                  placeholder="+243 ..."
                  error={form.formState.errors.phone?.message}
                  {...form.register('phone')}
                />
                <div className="p-3 border rounded-xl bg-muted/20 space-y-2">
                  <div className="flex items-center gap-2 min-h-[44px]">
                    <input
                      id="cb-is-titulaire"
                      type="checkbox"
                      checked={watchedIsTitulaire}
                      onChange={(e) => form.setValue('isTitulaire', e.target.checked)}
                      className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <Label htmlFor="cb-is-titulaire" className="font-semibold cursor-pointer">
                      Professeur titulaire d&apos;une classe
                    </Label>
                  </div>
                  {watchedIsTitulaire && (
                    <div className="space-y-1.5 pt-2 border-t border-dashed">
                      <Label className="text-xs text-muted-foreground">Sélectionner les classes sous sa responsabilité :</Label>
                      <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 bg-background rounded border">
                        {classes.map((c) => {
                          const checked = watchedTitulaireClassIds.includes(c.id);
                          return (
                            <label key={c.id} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted cursor-pointer min-h-[38px]">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? watchedTitulaireClassIds.filter((id) => id !== c.id)
                                    : [...watchedTitulaireClassIds, c.id];
                                  form.setValue('titulaireClassIds', next);
                                }}
                                className="h-3.5 w-3.5 rounded text-blue-600"
                              />
                              <span className="truncate">{c.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Champs spécifiques Élève */}
            {watchedRole === 'STUDENT' && (
              <>
                <div className="space-y-1.5">
                  <Label>Classe d&apos;affectation *</Label>
                  <Select
                    value={form.watch('classId') || undefined}
                    onValueChange={(val) => form.setValue('classId', val, { shouldValidate: true })}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Sélectionnez une classe" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.classId && (
                    <p className="text-xs text-red-600">{form.formState.errors.classId.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Parent référent (optionnel)</Label>
                  <Select
                    value={form.watch('parentId') || undefined}
                    onValueChange={(v) => form.setValue('parentId', v)}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Associer un compte parent existant" />
                    </SelectTrigger>
                    <SelectContent>
                      {parents.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="min-h-[44px]">
                Annuler
              </Button>
              <Button type="submit" disabled={submitting} className="min-h-[44px] bg-blue-600 hover:bg-blue-700 font-bold text-white">
                {submitting ? 'Enregistrement...' : editingUser ? 'Sauvegarder' : 'Créer le compte'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialogue Réinitialiser Mot de Passe */}
      <Dialog open={resetPwdDialogOpen} onOpenChange={setResetPwdDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-500" />
              Réinitialiser le mot de passe
            </DialogTitle>
            <DialogDescription>
              Pour <strong>{targetUserForPwd?.fullName}</strong> ({targetUserForPwd?.email})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {generatedTempPassword ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 rounded-xl space-y-2 text-center">
                <p className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">Nouveau mot de passe temporaire :</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="font-mono text-xl font-extrabold text-emerald-900 dark:text-emerald-200 tracking-wider">
                    {generatedTempPassword}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedTempPassword);
                      setPwdCopied(true);
                      setTimeout(() => setPwdCopied(false), 2000);
                      toast.success('Mot de passe copié !');
                    }}
                    className="p-1.5 rounded-lg bg-emerald-200/60 hover:bg-emerald-200 text-emerald-900"
                  >
                    {pwdCopied ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Transmettez ce mot de passe à l&apos;utilisateur.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Nouveau mot de passe (optionnel)</Label>
                  <Input
                    placeholder="Laisser vide pour générer aléatoirement"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    className="h-11 font-mono"
                  />
                  <p className="text-xs text-muted-foreground">Si vide, un mot de passe sécurisé sera automatiquement généré.</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {generatedTempPassword ? (
              <Button onClick={() => setResetPwdDialogOpen(false)} className="w-full min-h-[44px]">
                Fermer
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setResetPwdDialogOpen(false)} className="min-h-[44px]">
                  Annuler
                </Button>
                <Button onClick={handleResetPassword} disabled={resettingPwd} className="min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white font-bold">
                  {resettingPwd ? 'Réinitialisation...' : 'Valider la réinitialisation'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue Importation Excel / CSV */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Aperçu et validation de l&apos;importation CSV
            </DialogTitle>
            <DialogDescription>
              Vérifiez la conformité des lignes avant de lancer la création des comptes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/40 rounded-xl text-xs">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-foreground">Total analysé : {importRows.length} lignes</span>
                <span className="text-emerald-600 font-semibold">• {importRows.filter((r) => r.isValid).length} valides</span>
                {importRows.filter((r) => !r.isValid).length > 0 && (
                  <span className="text-red-600 font-semibold">• {importRows.filter((r) => !r.isValid).length} avec erreurs</span>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={downloadCsvTemplate} className="h-8 text-xs text-blue-600 hover:bg-blue-50">
                <Download className="w-3.5 h-3.5 mr-1" />
                Télécharger modèle CSV
              </Button>
            </div>

            {/* Table d'aperçu */}
            <div className="border rounded-xl overflow-hidden max-h-72 overflow-y-auto">
              <Table className="text-xs">
                <TableHeader className="bg-muted/40 sticky top-0">
                  <TableRow>
                    <TableHead>Ligne</TableHead>
                    <TableHead>Nom complet</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Sexe</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importRows.map((r) => (
                    <TableRow key={r.row} className={!r.isValid ? 'bg-red-50/50 dark:bg-red-950/20' : ''}>
                      <TableCell className="font-mono text-muted-foreground">{r.row}</TableCell>
                      <TableCell className="font-semibold">{r.fullName || '—'}</TableCell>
                      <TableCell>{r.email || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.role}</Badge>
                      </TableCell>
                      <TableCell>{r.gender}</TableCell>
                      <TableCell>{r.className || '—'}</TableCell>
                      <TableCell>
                        {r.isValid ? (
                          <Badge className="bg-emerald-100 text-emerald-700">Valide</Badge>
                        ) : (
                          <div className="space-y-0.5">
                            <Badge variant="destructive" className="text-[10px]">Erreur</Badge>
                            <p className="text-[10px] text-red-600">{r.errors.join(', ')}</p>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)} className="min-h-[44px]">
              Annuler
            </Button>
            <Button
              onClick={executeBatchImport}
              disabled={importing || importRows.filter((r) => r.isValid).length === 0}
              className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              {importing ? 'Importation en cours...' : `Importer ${importRows.filter((r) => r.isValid).length} compte(s) validé(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Suppression Individuelle */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Confirmer la suppression
            </AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le compte de <strong>{deletingUser?.fullName}</strong> ?
              Le compte sera archivé (soft-delete) et désactivé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="min-h-[44px] bg-red-600 hover:bg-red-700 text-white font-bold">
              Supprimer le compte
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation Suppression Groupée */}
      <AlertDialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Suppression groupée ({selectedUserIds.length} utilisateurs)
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette opération archivera et désactivera les {selectedUserIds.length} comptes sélectionnés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleBatchAction('delete')}
              className="min-h-[44px] bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              Confirmer la suppression groupée
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
