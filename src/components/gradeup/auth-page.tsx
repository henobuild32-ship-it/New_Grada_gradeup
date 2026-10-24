'use client';

import React, { useState, useEffect } from 'react';
import { isInviteCodeWellFormed, isStudentCodeWellFormed, normalizeInviteCode, normalizeStudentCode } from '@/lib/code-format';
import Image from 'next/image';
import { LandingPage, type LandingAction } from '@/components/landing/landing-page';
import { SiteFooter } from '@/components/landing/site-footer';
import { useAppStore } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import type { UserRole, PageView } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Loader2,
  Eye,
  EyeOff,
  Shield,
  Sparkles,
  Users,
  BookOpen,
  ArrowLeft,
  School,
  GraduationCap,
  UserCheck,
  Key,
  Copy,
  Check,
  X,
  Smartphone,
  ChevronRight,
  Zap,
  Lock,
  Mail,
  User,
  Globe,
  Award,
  Calendar,
  BarChart3,
  Bot,
  MessageCircle,
  Sun,
  Moon,
  CheckCircle2,
  Building2,
  FileSpreadsheet,
  Clock,
  Wallet,
  BellRing,
  ArrowRight,
  ShieldCheck,
  Laptop,
  Star,
} from 'lucide-react';

const roleDashboardMap: Record<UserRole, PageView> = {
  ADMIN: 'admin-dashboard',
  TEACHER: 'teacher-dashboard',
  STUDENT: 'student-dashboard',
  PARENT: 'parent-dashboard',
  CAISSIER: 'caisse',
};

const roleLabels: Record<string, string> = {
  STUDENT: 'Élève',
  TEACHER: 'Enseignant',
  PARENT: 'Parent',
  ADMIN: 'Direction / Admin',
  CAISSIER: 'Caissier',
};

const roleIcons: Record<string, React.ElementType> = {
  STUDENT: GraduationCap,
  TEACHER: UserCheck,
  PARENT: Users,
  ADMIN: Shield,
};

const roleColors: Record<string, { bg: string; border: string; badge: string; gradient: string }> = {
  STUDENT: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/20',
    border: 'border-emerald-200 dark:border-emerald-800/40',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300',
    gradient: 'from-emerald-500 to-teal-600',
  },
  TEACHER: {
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    border: 'border-blue-200 dark:border-blue-800/40',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300',
    gradient: 'from-blue-500 to-indigo-600',
  },
  PARENT: {
    bg: 'bg-purple-50 dark:bg-purple-950/20',
    border: 'border-purple-200 dark:border-purple-800/40',
    badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300',
    gradient: 'from-purple-500 to-pink-600',
  },
  ADMIN: {
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    border: 'border-amber-200 dark:border-amber-800/40',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300',
    gradient: 'from-amber-500 to-orange-600',
  },
};

function PasswordStrengthIndicator({ password }: { password: string }) {
  if (!password) return null;

  const length = password.length;
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  
  let score = 1;
  if (length >= 6) score++;
  if (length >= 8 && (hasUpper || hasNumber)) score++;

  const labels = ['Faible', 'Moyen', 'Sécurisé'];
  const colors = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500'];
  const textColors = ['text-rose-600 dark:text-rose-400', 'text-amber-600 dark:text-amber-400', 'text-emerald-600 dark:text-emerald-400'];

  return (
    <div className="space-y-1.5 mt-2 animate-fade-in">
      <div className="flex gap-1.5">
        {[1, 2, 3].map((level) => (
          <div
            key={level}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              level <= score ? colors[score - 1] : 'bg-muted/60'
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-semibold ${textColors[score - 1]}`}>
        Niveau de mot de passe : {labels[score - 1]}
      </p>
    </div>
  );
}

function AuthBrandPanel({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <aside className="relative isolate flex min-h-[164px] flex-col justify-between overflow-hidden rounded-[28px] bg-[#111820] p-4 text-white shadow-[0_24px_60px_-30px_rgba(15,23,42,0.55)] sm:min-h-[188px] sm:p-6 lg:sticky lg:top-24 lg:min-h-[600px] lg:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full border border-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-20 size-72 rounded-full border border-white/10" />
      <div className="relative z-10 flex items-center gap-4 lg:flex-col lg:items-start lg:gap-7">
        <div className="shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#10151c] shadow-2xl shadow-black/30">
          <Image
            src="/logo-gradeup.png"
            alt="Logo officiel GradeUp"
            width={240}
            height={240}
            priority
            className="size-[76px] object-contain sm:size-[92px] lg:size-[224px]"
          />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f1c979] sm:text-xs">{eyebrow}</p>
          <h2 className="mt-2 text-lg font-semibold leading-tight tracking-tight sm:text-xl lg:mt-4 lg:text-3xl lg:leading-tight">
            {title}
          </h2>
          <p className="mt-2 hidden max-w-sm text-sm leading-relaxed text-slate-300 lg:block">{description}</p>
        </div>
      </div>
      <div className="relative z-10 mt-5 hidden space-y-4 lg:block">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-[#f1c979]"><BookOpen className="size-5" /></span>
          <div><p className="text-sm font-semibold">Le suivi scolaire, simplement</p><p className="mt-0.5 text-xs text-slate-300">Notes, bulletins et présence au même endroit.</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-[#f1c979]"><Users className="size-5" /></span>
          <div><p className="text-sm font-semibold">Une école mieux connectée</p><p className="mt-0.5 text-xs text-slate-300">Un espace adapté à chaque rôle.</p></div>
        </div>
      </div>
      <p className="relative z-10 mt-4 hidden items-center gap-2 text-xs text-slate-300 lg:flex">
        <ShieldCheck className="size-4 text-emerald-300" /> Accès sécurisé selon votre profil
      </p>
    </aside>
  );
}

export default function AuthPage({ initialView }: { initialView?: LandingAction | null } = {}) {
  const { setUser, setCurrentPage, user } = useAppStore();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      const dashboardPage = roleDashboardMap[user.role as UserRole] || 'admin-dashboard';
      setCurrentPage(dashboardPage);
    }
  }, [user, setCurrentPage]);

  // Main navigation view state
  const [view, setView] = useState<'welcome' | 'login' | 'register-school' | 'register-user' | 'forgot'>(initialView ?? 'welcome');

  // Login form state
  const [loginInviteCode, setLoginInviteCode] = useState('');
  const [loginFullName, setLoginFullName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginIsAdmin, setLoginIsAdmin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginIdentity, setLoginIdentity] = useState(''); // champ unifié email ou nom
  const [loginRole, setLoginRole] = useState<UserRole>('STUDENT');

  // Forgot password (OTP) state
  const [forgotStep, setForgotStep] = useState<'identify' | 'otp' | 'reset'>('identify');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotIdentity, setForgotIdentity] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirm, setForgotConfirm] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotIsAdmin, setForgotIsAdmin] = useState(false);
  const [forgotCode, setForgotCode] = useState('');
  const [forgotResendIn, setForgotResendIn] = useState(0);

  // Register school state
  const [regSchoolName, setRegSchoolName] = useState('');
  const [regAdminName, setRegAdminName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regSchoolType, setRegSchoolType] = useState('Complexe Scolaire');
  const [regAdminGender, setRegAdminGender] = useState<'M' | 'F' | ''>('');
  const [regAdminBirthDate, setRegAdminBirthDate] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  // Register user state
  const [joinInviteCode, setJoinInviteCode] = useState('');
  const [joinFullName, setJoinFullName] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinConfirmPassword, setJoinConfirmPassword] = useState('');
  const [joinRole, setJoinRole] = useState<UserRole>('STUDENT');
  const [joinClassIds, setJoinClassIds] = useState<string[]>([]);
  const [joinParentCode, setJoinParentCode] = useState('');
  const [joinEmail, setJoinEmail] = useState('');
  const [joinGender, setJoinGender] = useState<'M' | 'F' | ''>('');
  const [joinBirthDate, setJoinBirthDate] = useState('');
  const [joinSpecialty, setJoinSpecialty] = useState('');
  const [joinPhone, setJoinPhone] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [schoolVerification, setSchoolVerification] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'network-error' | 'rate-limited'>('idle');
  const [schoolRetry, setSchoolRetry] = useState(0);
  const [studentVerification, setStudentVerification] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'network-error' | 'rate-limited'>('idle');
  const [studentRetry, setStudentRetry] = useState(0);
  const [verifiedStudent, setVerifiedStudent] = useState<{ code: string; name: string; className: string } | null>(null);
  const [showJoinPassword, setShowJoinPassword] = useState(false);
  const [showJoinConfirmPassword, setShowJoinConfirmPassword] = useState(false);

  // Verification state for invite code
  const [availableClasses, setAvailableClasses] = useState<{ id: string; name: string; level: string; cycle?: string; section?: string; option?: string }[]>([]);
  const [codeVerified, setCodeVerified] = useState(false);
  const [verifiedSchoolName, setVerifiedSchoolName] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);

  // School creation success state
  const [createdInviteCode, setCreatedInviteCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  const handleJoinInviteCodeChange = (value: string) => {
    const code = value.toUpperCase();
    setJoinInviteCode(code);
    setCodeVerified(false);
    setVerifiedSchoolName('');
    setAvailableClasses([]);
    setSchoolVerification('idle');
    setJoinRole('STUDENT');
    setJoinClassIds([]);
    setJoinParentCode('');
    setStudentVerification('idle');
    setVerifiedStudent(null);
    setJoinGender('');
    setJoinBirthDate('');
    setJoinSpecialty('');
    setJoinPhone('');
    setJoinFullName('');
    setJoinEmail('');
    setJoinPassword('');
    setJoinConfirmPassword('');
  };

  // Verify the school code after typing pauses. Abort + effect cleanup prevent
  // a late response for an older code from unlocking the form.
  useEffect(() => {
    const normalizedCode = normalizeInviteCode(joinInviteCode);
    if (view !== 'register-user' || !isInviteCodeWellFormed(normalizedCode)) {
      setVerifyingCode(false);
      setCodeVerified(false);
      setSchoolVerification('idle');
      return;
    }

    const controller = new AbortController();
    setVerifyingCode(true);
    setSchoolVerification('checking');
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/join/verify-school-code?code=${encodeURIComponent(normalizedCode)}`, { signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (response.status === 429) {
          setCodeVerified(false);
          setSchoolVerification('rate-limited');
          return;
        }
        if (!response.ok) {
          setCodeVerified(false);
          setSchoolVerification('network-error');
          return;
        }
        if (data.valid && data.school) {
          setCodeVerified(true);
          setSchoolVerification('valid');
          setVerifiedSchoolName(data.school.name || 'École trouvée');
          setAvailableClasses(Array.isArray(data.classes) ? data.classes : []);
        } else {
          setCodeVerified(false);
          setSchoolVerification('invalid');
          setVerifiedSchoolName('');
          setAvailableClasses([]);
        }
      } catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return;
        setCodeVerified(false);
        setSchoolVerification('network-error');
        setVerifiedSchoolName('');
        setAvailableClasses([]);
      } finally {
        if (!controller.signal.aborted) setVerifyingCode(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [joinInviteCode, view, schoolRetry]);

  // A parent confirms the school first, then verifies the child's code inside
  // that school. The server returns only the child's name and class.
  useEffect(() => {
    const normalizedCode = normalizeStudentCode(joinParentCode);
    if (view !== 'register-user' || joinRole !== 'PARENT' || !codeVerified || !isStudentCodeWellFormed(normalizedCode)) {
      setStudentVerification('idle');
      setVerifiedStudent(null);
      return;
    }

    const controller = new AbortController();
    setStudentVerification('checking');
    setVerifiedStudent(null);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ parentCode: normalizedCode, inviteCode: normalizeInviteCode(joinInviteCode) });
        const response = await fetch(`/api/parent-link/validate?${params.toString()}`, { signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (response.status === 429) {
          setStudentVerification('rate-limited');
        } else if (!response.ok) {
          setStudentVerification('network-error');
        } else if (data.valid) {
          setStudentVerification('valid');
          setVerifiedStudent({ code: normalizedCode, name: data.studentName, className: data.className || 'Classe non renseignée' });
        } else {
          setStudentVerification('invalid');
        }
      } catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return;
        setStudentVerification('network-error');
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [joinParentCode, joinRole, codeVerified, joinInviteCode, view, studentRetry]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginLoading) return;

    // Résoudre l'identité : email ou nom complet
    const identityValue = loginIdentity.trim();
    const resolvedEmail = (!loginIsAdmin && identityValue.includes('@')) ? identityValue : (loginIsAdmin ? loginEmail.trim() : '');
    const resolvedFullName = (!loginIsAdmin && !identityValue.includes('@')) ? identityValue : '';

    if (loginIsAdmin) {
      if (!loginEmail.trim() || !loginPassword) {
        toast({ title: 'Champs requis', description: 'Veuillez remplir votre email et votre mot de passe.', variant: 'destructive' });
        return;
      }
    } else {
      if (!loginInviteCode.trim() || !loginPassword || !identityValue) {
        toast({
          title: 'Champs requis',
          description: 'Veuillez renseigner le code école, votre email ou nom complet, et votre mot de passe.',
          variant: 'destructive',
        });
        return;
      }
    }
    setLoginLoading(true);
    try {
      const payload = loginIsAdmin
        ? {
            isAdminLogin: true,
            email: loginEmail.trim(),
            password: loginPassword,
          }
        : {
            isAdminLogin: false,
            inviteCode: loginInviteCode.toUpperCase().trim(),
            email: resolvedEmail || undefined,
            fullName: resolvedFullName || undefined,
            password: loginPassword,
          };

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Échec de connexion', description: data.error || 'Identifiants incorrects.', variant: 'destructive' });
        return;
      }
      setUser(data.user);
      const dashboardPage = roleDashboardMap[data.user.role as UserRole];
      setCurrentPage(dashboardPage);
      toast({ title: '✅ Connexion réussie !', description: `Bienvenue sur GradeUp, ${data.user.fullName} !` });
    } catch (err) {
      const isNetworkError = err instanceof TypeError && err.message.includes('fetch');
      toast({
        title: 'Erreur réseau',
        description: isNetworkError
          ? 'Impossible de contacter le serveur. Vérifiez votre connexion internet.'
          : 'Une erreur inattendue est survenue.',
        variant: 'destructive',
      });
    } finally {
      setLoginLoading(false);
    }
  };

  // ── Mot de passe oublié (OTP via SMTP) ────────────────────────────────────
  const forgotApiPayload = () => {
    const identity = forgotIdentity.trim();
    const isEmail = identity.includes('@');
    return {
      isAdminLogin: forgotIsAdmin,
      inviteCode: loginInviteCode.toUpperCase().trim(),
      email: forgotIsAdmin ? forgotEmail.trim() : isEmail ? identity : '',
      fullName: (!forgotIsAdmin && !isEmail) ? identity : '',
    };
  };

  const handleForgotRequest = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (forgotLoading) return;
    setForgotError('');
    setForgotMessage('');
    if (forgotIsAdmin ? !forgotEmail.trim() : !forgotIdentity.trim()) {
      setForgotError('Veuillez saisir votre identifiant.');
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forgotApiPayload()),
      });
      const data = await res.json();
      // réponse générique anti-énumération
      setForgotMessage(data.message || data.error || 'Si un compte correspond, un code a été envoyé.');
      if (res.ok) {
        setForgotCode('');
        setForgotStep('otp');
        setForgotResendIn(60);
      } else {
        setForgotError(data.error || 'Une erreur est survenue.');
      }
    } catch {
      setForgotError('Erreur réseau lors de la demande.');
    } finally {
      setForgotLoading(false);
    }
  };

  useEffect(() => {
    if (forgotResendIn <= 0) return;
    const t = setTimeout(() => setForgotResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [forgotResendIn]);

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotLoading) return;
    setForgotError('');
    if (!/^\d{6}$/.test(forgotCode.trim())) {
      setForgotError('Veuillez saisir le code OTP à 6 chiffres reçu par email.');
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...forgotApiPayload(), code: forgotCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setForgotError(data.error || 'Code invalide.');
        return;
      }
      setForgotStep('reset');
      setForgotMessage('');
    } catch {
      setForgotError('Erreur réseau lors de la vérification.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotLoading) return;
    setForgotError('');
    if (forgotNewPassword.length < 8) {
      setForgotError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (forgotNewPassword !== forgotConfirm) {
      setForgotError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...forgotApiPayload(), code: forgotCode.trim(), newPassword: forgotNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setForgotError(data.error || 'Erreur lors de la réinitialisation.');
        return;
      }
      if (data.user) {
        setUser(data.user);
        const dashboardPage = roleDashboardMap[data.user.role as UserRole];
        setCurrentPage(dashboardPage);
      }
      toast({ title: '✅ Mot de passe réinitialisé !', description: 'Vous êtes maintenant connecté.' });
    } catch {
      setForgotError('Erreur réseau lors de la réinitialisation.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regLoading) return;
    if (!regAdminName.trim() || !regSchoolName.trim() || !regEmail.trim() || !regPassword || !regConfirmPassword) {
      toast({ title: 'Champs obligatoires', description: 'Veuillez remplir tous les champs du formulaire.', variant: 'destructive' });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(regEmail.trim())) {
      toast({ title: 'Email invalide', description: 'Veuillez entrer une adresse email valide.', variant: 'destructive' });
      return;
    }
    if (regPassword !== regConfirmPassword) {
      toast({ title: 'Mots de passe non identiques', description: 'Les deux mots de passe doivent être identiques.', variant: 'destructive' });
      return;
    }
    if (regPassword.length < 8) {
      toast({ title: 'Mot de passe trop court', description: 'Le mot de passe doit comporter au moins 8 caractères.', variant: 'destructive' });
      return;
    }
    setRegLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'create-school',
          fullName: regAdminName.trim(),
          schoolName: `${regSchoolName.trim()} (${regSchoolType})`,
          email: regEmail.trim(),
          password: regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Erreur de création d'école", description: data.error || "Impossible de créer l'établissement.", variant: 'destructive' });
        return;
      }
      setCreatedInviteCode(data.inviteCode);
      setUser(data.user);
      setCurrentPage('admin-dashboard');
      toast({
        title: 'Établissement créé avec succès !',
        description: `Code d'invitation École : ${data.inviteCode}`,
        duration: 8000,
      });
    } catch {
      toast({
        title: 'Erreur',
        description: "Une erreur réseau est survenue lors de la création de l'école.",
        variant: 'destructive',
      });
    } finally {
      setRegLoading(false);
    }
  };

  const handleJoinSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joinLoading) return;
    if (!joinInviteCode.trim() || !joinFullName.trim() || !joinPassword || !joinConfirmPassword || !joinRole) {
      toast({ title: 'Champs manquants', description: 'Veuillez renseigner tous les champs requis.', variant: 'destructive' });
      return;
    }
    if (!codeVerified) {
      toast({ title: 'Code école invalide', description: 'Validez le code de votre école avant de poursuivre.', variant: 'destructive' });
      return;
    }
    if (joinPassword !== joinConfirmPassword) {
      toast({ title: 'Erreur de mot de passe', description: 'Les mots de passe ne correspondent pas.', variant: 'destructive' });
      return;
    }
    if (joinPassword.length < 8) {
      toast({ title: 'Mot de passe trop court', description: 'Le mot de passe doit comporter au moins 8 caractères.', variant: 'destructive' });
      return;
    }
    if (joinRole === 'STUDENT' && joinClassIds.length === 0) {
      toast({ title: 'Classe obligatoire', description: 'Veuillez sélectionner au moins une classe.', variant: 'destructive' });
      return;
    }
    if (!joinGender) {
      toast({ title: 'Sexe obligatoire', description: 'Veuillez sélectionner votre sexe (M ou F).', variant: 'destructive' });
      return;
    }
    if ((joinRole === 'STUDENT' || joinRole === 'TEACHER') && !joinBirthDate.trim()) {
      toast({ title: 'Date de naissance requise', description: 'Veuillez renseigner votre date de naissance.', variant: 'destructive' });
      return;
    }
    if (joinRole === 'TEACHER') {
      if (!joinSpecialty.trim()) {
        toast({ title: 'Spécialité requise', description: 'Veuillez renseigner votre spécialité.', variant: 'destructive' });
        return;
      }
      if (!joinPhone.trim()) {
        toast({ title: 'Téléphone requis', description: 'Veuillez renseigner votre numéro de téléphone.', variant: 'destructive' });
        return;
      }
    }
    if (joinRole === 'PARENT' && (studentVerification !== 'valid' || !verifiedStudent || verifiedStudent.code !== normalizeStudentCode(joinParentCode))) {
      toast({ title: 'Code élève à vérifier', description: 'Vérifiez le code de votre enfant et confirmez son nom et sa classe.', variant: 'destructive' });
      return;
    }
    setJoinLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'join-school',
          fullName: joinFullName.trim(),
          email: joinEmail.trim() || undefined,
          password: joinPassword,
          inviteCode: normalizeInviteCode(joinInviteCode),
          role: joinRole,
          gender: joinGender,
          dateOfBirth: joinBirthDate || undefined,
          specialty: joinRole === 'TEACHER' ? joinSpecialty.trim() : undefined,
          phone: joinRole === 'TEACHER' ? joinPhone.trim() : undefined,
          classIds: (joinRole === 'STUDENT' || joinRole === 'TEACHER') ? joinClassIds : undefined,
          parentCode: joinRole === 'PARENT' ? normalizeStudentCode(joinParentCode) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Erreur d'inscription", description: data.error || 'Erreur lors de la création du compte.', variant: 'destructive' });
        return;
      }
      setUser(data.user);
      setCurrentPage(roleDashboardMap[joinRole]);
      toast({ title: `Bienvenue, ${data.user.fullName} !`, description: 'Votre inscription est validée.' });
    } catch {
      toast({
        title: 'Erreur de Connexion',
        description: 'Erreur de Connexion. Veuillez vérifier votre connexion internet.',
        variant: 'destructive',
      });
    } finally {
      setJoinLoading(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCodeCopied(true);
    toast({ title: 'Code copié', description: 'Code d\'école copié dans le presse-papier.' });
    setTimeout(() => setCodeCopied(false), 2000);
  };


  // Pied de page partagé : identique à la page d'accueil.
  const renderFooter = () => <SiteFooter />;

  // En-tête des écrans d'authentification : logo + retour à l'accueil.
  const renderHeader = () => (
    <header className="sticky top-0 z-40 border-b border-line bg-background/85 backdrop-blur-md">
      <div className="landing-container flex h-16 items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setView('welcome')}
          className="flex items-center gap-3 rounded-md"
          aria-label="Retour à l’accueil GradeUp"
        >
          <span className="overflow-hidden rounded-xl bg-[#111820] ring-1 ring-black/10 dark:ring-white/10">
            <Image src="/logo-gradeup.png" alt="Logo GradeUp" width={48} height={48} priority className="size-11 object-contain" />
          </span>
          <span className="text-lg font-bold tracking-tight text-foreground">GradeUp</span>
        </button>

        <div className="flex items-center gap-1.5">
          {view === 'login' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView('register-user')}
              className="h-10 rounded-lg px-3 text-sm font-semibold"
            >
              Rejoindre mon école
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView('login')}
              className="h-10 rounded-lg px-3 text-sm font-semibold"
            >
              Se connecter
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setView('welcome')}
            className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand-hover"
          >
            <ArrowLeft className="size-4" />
            Accueil
          </Button>
        </div>
      </div>
    </header>
  );

  // ---------------------------------------------------------------------------
  // 1. ACCUEIL (PAGE MARKETING)
  if (view === 'welcome') {
    return <LandingPage onAction={setView} />;
  }

  // ---------------------------------------------------------------------------
  // 2. CONNEXION (LOGIN SCREEN)
  // ---------------------------------------------------------------------------
  if (view === 'login') {
    return (
      <div className="flex min-h-dvh flex-col bg-slate-50 text-foreground dark:bg-slate-950">
        {renderHeader()}

        <main className="flex-1">
          <div className="landing-container grid items-start gap-5 py-6 sm:gap-7 sm:py-10 lg:min-h-[680px] lg:grid-cols-[minmax(300px,0.86fr)_minmax(420px,1.14fr)] lg:gap-10 lg:py-12">
            <AuthBrandPanel
              eyebrow="Espace scolaire"
              title="Heureux de vous retrouver."
              description="Connectez-vous pour retrouver votre espace et les informations de votre école."
            />
            <section className="mx-auto w-full max-w-[560px] rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-slate-900 sm:p-8 lg:p-9">
              <div className="mb-7">
                <p className="inline-flex items-center gap-2 rounded-full bg-brand-subtle px-3 py-1.5 text-xs font-bold text-brand dark:bg-blue-950 dark:text-blue-200">
                  <Lock className="size-3.5" /> Connexion sécurisée
                </p>
                <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Se connecter</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Accédez à votre espace personnel GradeUp.</p>
              </div>

            {/* Toggle Mode User vs Admin */}
            <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setLoginIsAdmin(false)}
                aria-pressed={!loginIsAdmin}
                className={`min-h-11 rounded-xl px-2 py-2.5 text-xs font-bold transition-all sm:px-3 ${
                  !loginIsAdmin
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <User className="w-3.5 h-3.5 inline mr-1.5" />
                Élève / Prof / Parent
              </button>
              <button
                type="button"
                onClick={() => setLoginIsAdmin(true)}
                aria-pressed={loginIsAdmin}
                className={`min-h-11 rounded-xl px-2 py-2.5 text-xs font-bold transition-all sm:px-3 ${
                  loginIsAdmin
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Shield className="w-3.5 h-3.5 inline mr-1.5 text-amber-500" />
                Direction / Admin
              </button>
            </div>

            <form onSubmit={handleLogin} className="mt-6 space-y-5">
              {!loginIsAdmin ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-code" className="text-xs font-bold flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-blue-500" />
                      Code École
                    </Label>
                    <Input
                      id="login-code"
                      placeholder="Ex: ECOLE-XXXXXX"
                      value={loginInviteCode}
                      onChange={(e) => setLoginInviteCode(e.target.value.toUpperCase())}
                      className="h-12 rounded-xl font-mono uppercase tracking-wider"
                      required
                    />
                    <p className="text-[11px] text-muted-foreground">Le code d'invitation fourni par votre établissement.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="login-identity" className="text-xs font-bold flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-brand" />
                      {loginIdentity.includes('@') ? 'Email' : loginIdentity ? 'Nom Complet' : 'Email ou Nom Complet'}
                    </Label>
                    <Input
                      id="login-identity"
                      placeholder="Jean Dupont  ou  jean@exemple.com"
                      value={loginIdentity}
                      onChange={(e) => setLoginIdentity(e.target.value)}
                      autoComplete="username"
                      className="h-12 rounded-xl"
                      required
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {loginIdentity.includes('@')
                        ? '✉️ Connexion par adresse email détectée'
                        : loginIdentity
                        ? '👤 Connexion par nom complet détectée'
                        : 'Entrez votre email ou votre nom complet (exactement comme enregistré).'}
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="admin-email" className="text-xs font-bold flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-amber-500" />
                    Email Administrateur
                  </Label>
                  <Input
                    id="admin-email"
                    type="email"
                    placeholder="admin@ecole.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    autoComplete="username"
                    className="h-12 rounded-xl"
                    required
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="login-password" className="text-xs font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-brand" />
                  Mot de passe
                </Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showLoginPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-12 rounded-xl pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loginLoading}
                className="h-12 w-full rounded-xl bg-brand text-base font-bold text-brand-foreground shadow-md shadow-blue-900/10 transition hover:bg-brand-hover"
              >
                {loginLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connexion en cours...
                  </>
                ) : (
                  'Se connecter'
                )}
              </Button>
            </form>

            <div className="mt-6 space-y-4 border-t border-slate-200 pt-5 text-center dark:border-white/10">
              <p className="text-sm text-muted-foreground">
                Pas encore de compte ?{' '}
                <button
                  type="button"
                  onClick={() => setView('register-user')}
                  className="font-bold text-brand hover:underline"
                >
                  S'inscrire
                </button>
              </p>

              <p className="text-sm text-muted-foreground">
                Mot de passe oublié ?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setForgotIsAdmin(loginIsAdmin);
                    setForgotEmail(loginIsAdmin ? loginEmail : '');
                    setForgotIdentity(loginIsAdmin ? '' : loginIdentity);
                    setForgotStep('identify');
                    setForgotMessage('');
                    setForgotError('');
                    setView('forgot');
                  }}
                  className="font-bold text-brand hover:underline"
                >
                  Réinitialiser mon mot de passe
                </button>
              </p>
            </div>
            </section>
          </div>
        </main>
        {renderFooter()}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 3. MOT DE PASSE OUBLIÉ (OTP VIA SMTP)
  // ---------------------------------------------------------------------------
  if (view === 'forgot') {
    return (
      <div className="flex min-h-dvh flex-col bg-slate-50 text-foreground dark:bg-slate-950">
        {renderHeader()}

        <main className="flex-1">
          <div className="landing-container grid items-start gap-5 py-6 sm:gap-7 sm:py-10 lg:min-h-[680px] lg:grid-cols-[minmax(300px,0.86fr)_minmax(420px,1.14fr)] lg:gap-10 lg:py-12">
            <AuthBrandPanel
              eyebrow="Aide à la connexion"
              title="Retrouvez l’accès à votre compte."
              description="Nous vous accompagnons pour vérifier votre identité puis choisir un nouveau mot de passe."
            />
            <section className="mx-auto w-full max-w-[560px] rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-slate-900 sm:p-8 lg:p-9">
              <div className="mb-7">
                <p className="inline-flex items-center gap-2 rounded-full bg-brand-subtle px-3 py-1.5 text-xs font-bold text-brand dark:bg-blue-950 dark:text-blue-200">
                  <Lock className="size-3.5" /> Récupération sécurisée
                </p>
                <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Mot de passe oublié</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {forgotStep === 'identify' && 'Recevez un code de réinitialisation par email'}
                {forgotStep === 'otp' && 'Saisissez le code reçu par email'}
                {forgotStep === 'reset' && 'Choisissez votre nouveau mot de passe'}
                </p>
              </div>

            {/* Stepper */}
            <div className="flex items-center justify-center gap-2 text-[11px] font-bold">
              {['identify', 'otp', 'reset'].map((step, idx) => (
                <div key={step} className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
                      ['identify', 'otp', 'reset'].indexOf(forgotStep) >= idx
                        ? 'bg-brand text-brand-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {idx + 1}
                  </div>
                  {idx < 2 && <div className="w-6 h-0.5 bg-muted rounded-full" />}
                </div>
              ))}
            </div>

            {forgotMessage && !forgotError && forgotStep !== 'reset' && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                {forgotMessage}
              </div>
            )}
            {forgotError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-medium">
                {forgotError}
              </div>
            )}

            {forgotStep === 'identify' && (
              <form onSubmit={handleForgotRequest} className="space-y-4">
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setForgotIsAdmin(false)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                      !forgotIsAdmin ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <User className="w-3.5 h-3.5 inline mr-1.5" />
                    Élève / Prof / Parent
                  </button>
                  <button
                    type="button"
                    onClick={() => setForgotIsAdmin(true)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                      forgotIsAdmin ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5 inline mr-1.5 text-amber-500" />
                    Direction / Admin
                  </button>
                </div>

                {forgotIsAdmin ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-amber-500" />
                      Email Administrateur
                    </Label>
                    <Input
                      type="email"
                      placeholder="admin@ecole.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="h-11 rounded-xl"
                      required
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-blue-500" />
                        Code École
                      </Label>
                      <Input
                        placeholder="Ex: ECOLE-XXXXXX"
                        value={loginInviteCode}
                        onChange={(e) => setLoginInviteCode(e.target.value.toUpperCase())}
                        className="h-11 font-mono uppercase tracking-wider rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-brand" />
                        Email ou Nom Complet
                      </Label>
                      <Input
                        placeholder="Jean Dupont  ou  jean@exemple.com"
                        value={forgotIdentity}
                        onChange={(e) => setForgotIdentity(e.target.value)}
                        className="h-11 rounded-xl"
                        required
                      />
                    </div>
                  </>
                )}

                <Button type="submit" disabled={forgotLoading} className="h-12 w-full rounded-xl bg-brand text-base font-bold text-brand-foreground shadow-md shadow-blue-900/10 hover:bg-brand-hover">
                  {forgotLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Envoi du code...
                    </>
                  ) : (
                    'Recevoir le code par email'
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Si vous ne recevez rien, vérifiez vos spams / courriers indésirables.
                </p>
              </form>
            )}

            {forgotStep === 'otp' && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-brand" />
                    Code à 6 chiffres
                  </Label>
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••••"
                    value={forgotCode}
                    onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ''))}
                    className="h-12 rounded-xl text-center text-xl font-black tracking-[0.5em]"
                    autoFocus
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Le code OTP à 6 chiffres est valable 10 minutes. Vérifiez vos spams si nécessaire.
                  </p>
                </div>

                <Button type="submit" disabled={forgotLoading || forgotCode.length < 6} className="h-12 w-full rounded-xl bg-brand text-base font-bold text-brand-foreground shadow-md shadow-blue-900/10 hover:bg-brand-hover">
                  {forgotLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Vérification...
                    </>
                  ) : (
                    'Vérifier le code'
                  )}
                </Button>

                <div className="text-center">
                  {forgotResendIn > 0 ? (
                    <span className="text-xs text-muted-foreground">Renvoi possible dans {forgotResendIn}s</span>
                  ) : (
                    <button type="button" onClick={() => { setForgotStep('identify'); setForgotMessage(''); setForgotError(''); }} className="text-xs font-bold text-brand hover:underline">
                      Retour et renvoyer le code
                    </button>
                  )}
                </div>
              </form>
            )}

            {forgotStep === 'reset' && (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-brand" />
                    Nouveau mot de passe
                  </Label>
                  <Input
                    type="password"
                    placeholder="Au moins 8 caractères"
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    className="h-11 rounded-xl"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Confirmer le mot de passe</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={forgotConfirm}
                    onChange={(e) => setForgotConfirm(e.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    className="h-11 rounded-xl"
                    required
                  />
                </div>

                <Button type="submit" disabled={forgotLoading} className="h-12 w-full rounded-xl bg-brand text-base font-bold text-brand-foreground shadow-md shadow-blue-900/10 hover:bg-brand-hover">
                  {forgotLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Réinitialisation...
                    </>
                  ) : (
                    'Réinitialiser mon mot de passe'
                  )}
                </Button>
              </form>
            )}

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => { setView('login'); setForgotError(''); setForgotMessage(''); }}
                className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Retour à la connexion
              </button>
            </div>
            </section>
          </div>
        </main>
        {renderFooter()}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 4. INSCRIPTION (REGISTRATION SCREEN)
  // ---------------------------------------------------------------------------
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-foreground dark:bg-slate-950">
      {renderHeader()}

      <main className="flex-1">
        <div className="landing-container grid items-start gap-5 py-6 sm:gap-7 sm:py-10 lg:min-h-[700px] lg:grid-cols-[minmax(280px,0.72fr)_minmax(540px,1.28fr)] lg:gap-10 lg:py-12">
          <AuthBrandPanel
            eyebrow="Inscription GradeUp"
            title={view === 'register-school' ? 'Donnez à votre école un espace à elle.' : 'Rejoignez votre communauté scolaire.'}
            description="Créez un espace d’établissement ou rejoignez celui que votre école utilise déjà."
          />
          <section className="mx-auto w-full max-w-[760px] rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-slate-900 sm:p-8 lg:p-9">
            <div className="mb-7">
              <p className="inline-flex items-center gap-2 rounded-full bg-brand-subtle px-3 py-1.5 text-xs font-bold text-brand dark:bg-blue-950 dark:text-blue-200">
                <UserCheck className="size-3.5" /> Commencez en quelques étapes
              </p>
              <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Créer un accès GradeUp</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Choisissez votre parcours pour commencer.</p>
            </div>

          {/* Dual Tabs for Registration */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted rounded-2xl">
            <button
              type="button"
              onClick={() => setView('register-user')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                view === 'register-user'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Rejoindre une École
            </button>
            <button
              type="button"
              onClick={() => setView('register-school')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                view === 'register-school'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <School className="w-3.5 h-3.5 inline mr-1 text-brand" />
              Créer mon École
            </button>
          </div>

          {/* FORM A: CREATE SCHOOL */}
          {view === 'register-school' && (
            <>
              {createdInviteCode ? (
                <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-4 animate-scale-in">
                  <div className="w-12 h-12 rounded-full bg-emerald-500 text-white mx-auto flex items-center justify-center shadow-md">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                    Félicitations ! Votre école est créée.
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Partagez ce code d'invitation avec vos enseignants, élèves et parents pour qu'ils s'inscrivent :
                  </p>
                  <div className="p-4 rounded-xl bg-card border font-mono text-2xl font-black tracking-widest text-primary flex items-center justify-center gap-3">
                    <span>{createdInviteCode}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => copyCode(createdInviteCode)}
                      className="rounded-lg h-9 w-9"
                    >
                      {codeCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <Button
                    onClick={() => setCurrentPage('admin-dashboard')}
                    className="w-full rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Accéder au Tableau de Bord Direction
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleCreateSchool} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="school-name" className="text-xs font-bold">Nom de l'Établissement</Label>
                    <Input
                      id="school-name"
                      placeholder="Ex: Complexe Scolaire Saint-Joseph"
                      value={regSchoolName}
                      onChange={(e) => setRegSchoolName(e.target.value)}
                      className="h-11 rounded-xl"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="school-type" className="text-xs font-bold">Type de Structure</Label>
                    <select
                      id="school-type"
                      value={regSchoolType}
                      onChange={(e) => setRegSchoolType(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm font-medium"
                    >
                      <option value="Complexe Scolaire">Complexe Scolaire (Maternelle - Secondaire)</option>
                      <option value="École Primaire / Fondamentale">École Primaire / Fondamentale</option>
                      <option value="Lycée / Collège">Lycée / Collège</option>
                      <option value="Institut Supérieur / Université">Institut Supérieur / Université</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="admin-name" className="text-xs font-bold">Nom Complet du Fondateur / Directeur</Label>
                    <Input
                      id="admin-name"
                      placeholder="Ex: Prof. Marc Kabamba"
                      value={regAdminName}
                      onChange={(e) => setRegAdminName(e.target.value)}
                      className="h-11 rounded-xl"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="reg-email" className="text-xs font-bold">Email de l'Établissement</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="contact@ecole-exemple.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="h-11 rounded-xl"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-pass" className="text-xs font-bold">Mot de passe</Label>
                      <div className="relative">
                        <Input
                          id="reg-pass"
                          type={showRegPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          minLength={8}
                          autoComplete="new-password"
                          className="h-11 rounded-xl pr-9"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword(!showRegPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                        >
                          {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="reg-confirm" className="text-xs font-bold">Confirmer Mot de passe</Label>
                      <div className="relative">
                        <Input
                          id="reg-confirm"
                          type={showRegConfirmPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={regConfirmPassword}
                          onChange={(e) => setRegConfirmPassword(e.target.value)}
                          minLength={8}
                          autoComplete="new-password"
                          className="h-11 rounded-xl pr-9"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                        >
                          {showRegConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <PasswordStrengthIndicator password={regPassword} />

                  <Button
                    type="submit"
                    disabled={regLoading}
                    className="h-12 w-full rounded-xl bg-brand text-base font-bold text-brand-foreground shadow-md shadow-blue-900/10 hover:bg-brand-hover"
                  >
                    {regLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Création de l'école...
                      </>
                    ) : (
                      "Créer mon École & Obtenir le Code"
                    )}
                  </Button>
                </form>
              )}
            </>
          )}

          {/* FORM B: JOIN SCHOOL */}
          {view === 'register-user' && (
            <form onSubmit={handleJoinSchool} className="space-y-4">
              {/* Invite code with live verification */}
              <div className="space-y-1.5">
                <Label htmlFor="join-code" className="text-xs font-bold flex items-center justify-between">
                  <span>Code École (Fourni par l'établissement)</span>
                  {verifyingCode && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                </Label>
                <div className="relative">
                  <Input
                    id="join-code"
                    placeholder="Ex: ECOLE-XXXXXX"
                    value={joinInviteCode}
                    onChange={(e) => handleJoinInviteCodeChange(e.target.value)}
                    className="h-11 font-mono uppercase tracking-wider rounded-xl pr-10"
                    autoComplete="off"
                    required
                  />
                  {codeVerified && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>

                {codeVerified && (
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1">
                    <Check className="w-3.5 h-3.5" /> Établissement vérifié : {verifiedSchoolName}
                  </p>
                )}
                {schoolVerification === 'invalid' && (
                  <p role="status" className="text-xs font-medium text-destructive">Le code n’est pas valide.</p>
                )}
                {schoolVerification === 'network-error' && (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-xs text-destructive">
                    <span>Erreur de Connexion. Veuillez vérifier votre connexion internet.</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => setSchoolRetry((value) => value + 1)}>Réessayer</Button>
                  </div>
                )}
                {schoolVerification === 'rate-limited' && (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-xs text-destructive">
                    <span>Trop de tentatives. Réessayez plus tard.</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => setSchoolRetry((value) => value + 1)}>Réessayer</Button>
                  </div>
                )}
              </div>

              <fieldset disabled={!codeVerified} className="contents">
              {/* Role Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Votre Rôle dans l'École</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(['STUDENT', 'TEACHER', 'PARENT'] as UserRole[]).map((r) => {
                    const RIcon = roleIcons[r];
                    const isSel = joinRole === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        disabled={!codeVerified}
                        onClick={() => {
                          setJoinRole(r);
                          setJoinClassIds([]);
                          setJoinParentCode('');
                          setStudentVerification('idle');
                          setVerifiedStudent(null);
                        }}
                        aria-pressed={isSel}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${isSel ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm' : 'border-border/60 hover:bg-muted text-muted-foreground'} ${!codeVerified ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        <RIcon className="w-5 h-5" />
                        <span className="text-xs">{roleLabels[r]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Class selection for Student/Teacher */}
              {(joinRole === 'STUDENT' || joinRole === 'TEACHER') && (
                <div className="space-y-1.5">
                  <Label htmlFor="join-class" className="text-xs font-bold">
                    {joinRole === 'STUDENT' ? 'Votre Classe' : 'Classe(s) Enseignée(s)'}
                  </Label>
                  {availableClasses.length > 0 ? (
                    <select
                      id="join-class"
                      value={joinClassIds[0] || ''}
                      onChange={(e) => setJoinClassIds([e.target.value])}
                      className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm font-medium"
                      required
                    >
                      <option value="">-- Sélectionner une classe --</option>
                      {availableClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {[c.name, c.level, c.section, c.option].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Cette école n’a pas encore configuré ses classes.</p>
                  )}
                </div>
              )}

              {/* Parent linkage code */}
              {joinRole === 'PARENT' && codeVerified && (
                <div className="space-y-1.5">
                  <Label htmlFor="join-parent-code" className="text-xs font-bold">
                    Code de l’élève
                  </Label>
                  <Input
                    id="join-parent-code"
                    placeholder="Ex. P-ABCDEF"
                    value={joinParentCode}
                    onChange={(e) => setJoinParentCode(e.target.value.toUpperCase())}
                    className="h-11 rounded-xl uppercase font-mono"
                    required
                  />
                  {studentVerification === 'checking' && <p className="text-xs text-muted-foreground">Vérification dans {verifiedSchoolName}…</p>}
                  {studentVerification === 'valid' && verifiedStudent && (
                    <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
                      <Check className="mt-0.5 size-4 shrink-0" />
                      <span>Élève confirmé : <strong>{verifiedStudent.name}</strong><br />Classe : {verifiedStudent.className}</span>
                    </p>
                  )}
                  {studentVerification === 'invalid' && <p role="status" className="text-xs text-destructive">Le code n’est pas valide dans cette école.</p>}
                  {studentVerification === 'network-error' && (
                    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-xs text-destructive">
                      <span>Erreur de Connexion. Veuillez vérifier votre connexion internet.</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => setStudentRetry((value) => value + 1)}>Réessayer</Button>
                    </div>
                  )}
                  {studentVerification === 'rate-limited' && (
                    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-xs text-destructive">
                      <span>Trop de tentatives. Réessayez plus tard.</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => setStudentRetry((value) => value + 1)}>Réessayer</Button>
                    </div>
                  )}
                </div>
              )}

              {/* Gender M/F obligatoire */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">
                  Sexe <span className="text-destructive">*</span>
                </Label>
                <RadioGroup
                  value={joinGender}
                  onValueChange={(v) => setJoinGender(v as 'M' | 'F')}
                  disabled={!codeVerified}
                  className="grid grid-cols-2 gap-2"
                >
                  <Label
                    htmlFor="join-gender-m"
                    className={`flex items-center justify-center gap-2 h-11 rounded-xl border font-semibold text-sm cursor-pointer transition-all ${
                      joinGender === 'M'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/60 hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <RadioGroupItem value="M" id="join-gender-m" className="sr-only" />
                    <User className="w-4 h-4" /> Masculin
                  </Label>
                  <Label
                    htmlFor="join-gender-f"
                    className={`flex items-center justify-center gap-2 h-11 rounded-xl border font-semibold text-sm cursor-pointer transition-all ${
                      joinGender === 'F'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/60 hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    <RadioGroupItem value="F" id="join-gender-f" className="sr-only" />
                    <User className="w-4 h-4" /> Féminin
                  </Label>
                </RadioGroup>
              </div>

              {/* Date de naissance pour STUDENT/TEACHER */}
              {(joinRole === 'STUDENT' || joinRole === 'TEACHER') && (
                <div className="space-y-1.5">
                  <Label htmlFor="join-birthdate" className="text-xs font-bold">
                    Date de Naissance <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="join-birthdate"
                    type="date"
                    value={joinBirthDate}
                    onChange={(e) => setJoinBirthDate(e.target.value)}
                    className="h-11 rounded-xl"
                    required
                  />
                </div>
              )}

              {/* Spécialité + Téléphone pour TEACHER */}
              {joinRole === 'TEACHER' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="join-specialty" className="text-xs font-bold">
                      Spécialité <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="join-specialty"
                      placeholder="Ex: Mathématiques, Français"
                      value={joinSpecialty}
                      onChange={(e) => setJoinSpecialty(e.target.value)}
                      className="h-11 rounded-xl"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="join-phone" className="text-xs font-bold">
                      Téléphone <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="join-phone"
                      type="tel"
                      placeholder="+243 ..."
                      value={joinPhone}
                      onChange={(e) => setJoinPhone(e.target.value)}
                      className="h-11 rounded-xl"
                      required
                    />
                  </div>
                </>
              )}

              {/* Identity details */}
              <div className="space-y-1.5">
                <Label htmlFor="join-fullname" className="text-xs font-bold">Nom Complet</Label>
                <Input
                  id="join-fullname"
                  placeholder="Nom Prénom"
                  value={joinFullName}
                  onChange={(e) => setJoinFullName(e.target.value)}
                  className="h-11 rounded-xl"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="join-email" className="text-xs font-bold">Adresse Email (Optionnel)</Label>
                <Input
                  id="join-email"
                  type="email"
                  placeholder="nom@exemple.com"
                  value={joinEmail}
                  onChange={(e) => setJoinEmail(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>

              {/* Passwords */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="join-pass" className="text-xs font-bold">Mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="join-pass"
                      type={showJoinPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={joinPassword}
                      onChange={(e) => setJoinPassword(e.target.value)}
                      minLength={8}
                      autoComplete="new-password"
                      className="h-11 rounded-xl pr-9"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowJoinPassword(!showJoinPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showJoinPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="join-pass-confirm" className="text-xs font-bold">Confirmer</Label>
                  <div className="relative">
                    <Input
                      id="join-pass-confirm"
                      type={showJoinConfirmPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={joinConfirmPassword}
                      onChange={(e) => setJoinConfirmPassword(e.target.value)}
                      minLength={8}
                      autoComplete="new-password"
                      className="h-11 rounded-xl pr-9"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowJoinConfirmPassword(!showJoinConfirmPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showJoinConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              </fieldset>

              <Button
                type="submit"
                disabled={joinLoading || !codeVerified || (joinRole === 'PARENT' && studentVerification !== 'valid')}
                className="h-12 w-full rounded-xl bg-brand text-base font-bold text-brand-foreground shadow-md shadow-blue-900/10 hover:bg-brand-hover"
              >
                {joinLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Inscription en cours...
                  </>
                ) : (
                  "Valider mon Inscription"
                )}
              </Button>
            </form>
          )}

          <div className="pt-2 text-center">
            <p className="text-xs text-muted-foreground">
              Déjà inscrit ?{' '}
              <button
                type="button"
                onClick={() => setView('login')}
                className="font-bold text-primary hover:underline"
              >
                Se connecter
              </button>
            </p>
          </div>
          </section>
        </div>
      </main>
      {renderFooter()}
    </div>
  );
}
