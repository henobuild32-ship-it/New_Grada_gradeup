'use client';

import { useAppStore } from '@/lib/store';
import type { PageView } from '@/lib/types';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';

import AuthPage from '@/components/gradeup/auth-page';
import AppLayout from '@/components/gradeup/app-layout';
import { installAuthenticatedFetchRecovery } from '@/lib/auth/authenticated-fetch';

// Squelette affiché pendant le chargement différé (code-splitting) d'une page.
function PageSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-muted" />
      <div className="h-4 w-72 rounded bg-muted/70" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-muted/60" />
        ))}
      </div>
    </div>
  );
}

// Chargement différé (lazy-loading) de chaque page : le bundle initial ne contient
// que l'authentification et le layout. Chaque page n'est téléchargée qu'à la navigation.
const AdminDashboard = dynamic(() => import('@/components/gradeup/admin-dashboard'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminUsers = dynamic(() => import('@/components/gradeup/admin-users'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminClasses = dynamic(() => import('@/components/gradeup/admin-classes'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminPayments = dynamic(() => import('@/components/gradeup/admin-payments'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminBulletins = dynamic(() => import('@/components/gradeup/admin-bulletins'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminConfig = dynamic(() => import('@/components/gradeup/admin-config'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminReports = dynamic(() => import('@/components/gradeup/admin-reports'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminNotifications = dynamic(() => import('@/components/gradeup/admin-notifications'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminConferences = dynamic(() => import('@/components/gradeup/admin-conferences'), { ssr: false, loading: () => <PageSkeleton /> });
const MeetingsHub = dynamic(() => import('@/components/gradeup/meetings/meetings-hub'), { ssr: false, loading: () => <PageSkeleton /> });
const MeetingRoom = dynamic(() => import('@/components/gradeup/meetings/meeting-room'), { ssr: false, loading: () => <PageSkeleton /> });
const LibraryHub = dynamic(() => import('@/components/gradeup/library/library-hub'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminCards = dynamic(() => import('@/components/gradeup/admin-cards'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminAi = dynamic(() => import('@/components/gradeup/admin-ai'), { ssr: false, loading: () => <PageSkeleton /> });
const TuitionTracking = dynamic(() => import('@/components/gradeup/tuition-tracking'), { ssr: false, loading: () => <PageSkeleton /> });
const CashierCaisse = dynamic(() => import('@/components/gradeup/cashier-caisse'), { ssr: false, loading: () => <PageSkeleton /> });
const CashierNotifications = dynamic(() => import('@/components/gradeup/cashier-notifications'), { ssr: false, loading: () => <PageSkeleton /> });
const EndOfYear = dynamic(() => import('@/components/gradeup/end-of-year'), { ssr: false, loading: () => <PageSkeleton /> });
const TeacherCanonicalBulletins = dynamic(() => import('@/components/gradeup/teacher-canonical-bulletins'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminCourses = dynamic(() => import('@/components/gradeup/admin-courses'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminPresence = dynamic(() => import('@/components/gradeup/admin-presence'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminSchedules = dynamic(() => import('@/components/gradeup/admin-schedules'), { ssr: false, loading: () => <PageSkeleton /> });
const AutoReportSyncPanel = dynamic(() => import('@/components/gradeup/auto-report-sync-panel'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminSchoolCalendar = dynamic(() => import('@/components/gradeup/admin-school-calendar'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminCoefficients = dynamic(() => import('@/components/gradeup/admin-coefficients'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminPassages = dynamic(() => import('@/components/gradeup/admin-passages'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminNoteModifications = dynamic(() => import('@/components/gradeup/admin-note-modifications'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminGradeValidation = dynamic(() => import('@/components/gradeup/admin-grade-validation'), { ssr: false, loading: () => <PageSkeleton /> });
const CahierCotation = dynamic(() => import('@/components/gradeup/cahier-cotation'), { ssr: false, loading: () => <PageSkeleton /> });
const AdminCotationRules = dynamic(() => import('@/components/gradeup/admin-cotation-rules'), { ssr: false, loading: () => <PageSkeleton /> });
const TeacherDashboard = dynamic(() => import('@/components/gradeup/teacher-dashboard'), { ssr: false, loading: () => <PageSkeleton /> });
const TeacherCourses = dynamic(() => import('@/components/gradeup/teacher-courses'), { ssr: false, loading: () => <PageSkeleton /> });
const TeacherClasses = dynamic(() => import('@/components/gradeup/teacher-classes'), { ssr: false, loading: () => <PageSkeleton /> });
const TeacherLessons = dynamic(() => import('@/components/gradeup/teacher-lessons'), { ssr: false, loading: () => <PageSkeleton /> });
const TeacherGrades = dynamic(() => import('@/components/gradeup/teacher-grades'), { ssr: false, loading: () => <PageSkeleton /> });
const TeacherHomework = dynamic(() => import('@/components/gradeup/teacher-homework'), { ssr: false, loading: () => <PageSkeleton /> });
const TeacherDocuments = dynamic(() => import('@/components/gradeup/teacher-documents'), { ssr: false, loading: () => <PageSkeleton /> });
const TeacherAttendance = dynamic(() => import('@/components/gradeup/teacher-attendance'), { ssr: false, loading: () => <PageSkeleton /> });
const TeacherSchedules = dynamic(() => import('@/components/gradeup/schedules-page'), { ssr: false, loading: () => <PageSkeleton /> });
const TeacherAI = dynamic(() => import('@/components/gradeup/teacher-ai'), { ssr: false, loading: () => <PageSkeleton /> });
const TeacherNotifications = dynamic(() => import('@/components/gradeup/teacher-notifications'), { ssr: false, loading: () => <PageSkeleton /> });
const StudentDashboard = dynamic(() => import('@/components/gradeup/student-dashboard'), { ssr: false, loading: () => <PageSkeleton /> });
const StudentCourses = dynamic(() => import('@/components/gradeup/student-courses'), { ssr: false, loading: () => <PageSkeleton /> });
const StudentLessons = dynamic(() => import('@/components/gradeup/student-lessons'), { ssr: false, loading: () => <PageSkeleton /> });
const StudentGrades = dynamic(() => import('@/components/gradeup/student-grades'), { ssr: false, loading: () => <PageSkeleton /> });
const StudentBulletins = dynamic(() => import('@/components/gradeup/student-bulletins'), { ssr: false, loading: () => <PageSkeleton /> });
const StudentAttendance = dynamic(() => import('@/components/gradeup/student-attendance'), { ssr: false, loading: () => <PageSkeleton /> });
const StudentAI = dynamic(() => import('@/components/gradeup/student-ai'), { ssr: false, loading: () => <PageSkeleton /> });
const StudentSchedules = dynamic(() => import('@/components/gradeup/schedules-page'), { ssr: false, loading: () => <PageSkeleton /> });
const StudentHomework = dynamic(() => import('@/components/gradeup/student-homework'), { ssr: false, loading: () => <PageSkeleton /> });
const StudentNotifications = dynamic(() => import('@/components/gradeup/student-notifications'), { ssr: false, loading: () => <PageSkeleton /> });
const StudentPayments = dynamic(() => import('@/components/gradeup/student-payments'), { ssr: false, loading: () => <PageSkeleton /> });
const ParentDashboard = dynamic(() => import('@/components/gradeup/parent-dashboard'), { ssr: false, loading: () => <PageSkeleton /> });
const ParentGrades = dynamic(() => import('@/components/gradeup/parent-grades'), { ssr: false, loading: () => <PageSkeleton /> });
const ParentBulletins = dynamic(() => import('@/components/gradeup/parent-bulletins'), { ssr: false, loading: () => <PageSkeleton /> });
const ParentPayments = dynamic(() => import('@/components/gradeup/parent-payments'), { ssr: false, loading: () => <PageSkeleton /> });
const ParentNotifications = dynamic(() => import('@/components/gradeup/parent-notifications'), { ssr: false, loading: () => <PageSkeleton /> });
const ParentAI = dynamic(() => import('@/components/gradeup/parent-ai'), { ssr: false, loading: () => <PageSkeleton /> });
const ProfilePage = dynamic(() => import('@/components/gradeup/profile-page'), { ssr: false, loading: () => <PageSkeleton /> });
const MessageCenter = dynamic(() => import('@/components/gradeup/message-center'), { ssr: false, loading: () => <PageSkeleton /> });
const ChatPage = dynamic(() => import('@/components/gradeup/chat-page'), { ssr: false, loading: () => <PageSkeleton /> });
const SchoolCalendar = dynamic(() => import('@/components/gradeup/school-calendar'), { ssr: false, loading: () => <PageSkeleton /> });
const HelpPage = dynamic(() => import('@/components/gradeup/help-page'), { ssr: false, loading: () => <PageSkeleton /> });
const SyncCenter = dynamic(() => import('@/components/gradeup/sync-center'), { ssr: false, loading: () => <PageSkeleton /> });

function PageRouter({ page }: { page: PageView }) {
  const { user } = useAppStore();

  // Navigation is not an authorization boundary, but never render a role-specific
  // screen when a stale client state points at another user's module.
  if (user) {
    const prefix = user.role === 'ADMIN' ? 'admin-' : user.role === 'TEACHER' ? 'teacher-' : user.role === 'STUDENT' ? 'student-' : user.role === 'CAISSIER' ? 'caisse' : 'parent-';
    const shared = new Set<PageView>(['meetings', 'meeting-room', 'library', 'messages', 'calendar', 'profile', 'help', 'sync-center']);
    const roleShared = (user.role === 'ADMIN' || user.role === 'TEACHER') && new Set<PageView>(['cahier-cotation', 'auto-report-sync', 'admin-note-modifications']).has(page);
    if (user.role === 'ADMIN' && page === 'admin-grade-validation') return <AdminGradeValidation />;
    const allowed = page === 'auth' || page === 'register' || shared.has(page) || roleShared || (user.role === 'ADMIN' && page === 'admin-grade-validation') || page === `${prefix}dashboard` || page.startsWith(prefix);
    if (!allowed) return <AuthPage />;
  }

  if (page === 'auth' || page === 'register') return <AuthPage />;
  if (page === 'admin-dashboard') return <AdminDashboard />;
  if (page === 'admin-users') return <AdminUsers />;
  if (page === 'admin-classes') return <AdminClasses />;
  if (page === 'admin-payments') return <AdminPayments />;
  if (page === 'admin-bulletins') return <AdminBulletins />;
  if (page === 'admin-config') return <AdminConfig />;
  if (page === 'admin-reports') return <AdminReports />;
  if (page === 'admin-notifications') return <AdminNotifications />;
  if (page === 'admin-conferences') return <AdminConferences />;
  if (page === 'meetings') return <MeetingsHub />;
  if (page === 'meeting-room') return <MeetingRoom />;
  if (page === 'library') return <LibraryHub />;
  if (page === 'admin-cards') return <AdminCards />;
  if (page === 'admin-courses') return <AdminCourses />;
  if (page === 'admin-presence') return <AdminPresence />;
  if (page === 'admin-schedules') return <AdminSchedules />;
  if (page === 'admin-school-calendar') return <AdminSchoolCalendar />;
  if (page === 'admin-coefficients') return <AdminCoefficients />;
  if (page === 'admin-passages') return <AdminPassages />;
  if (page === 'admin-note-modifications') return <AdminNoteModifications />;
  if (page === 'admin-grade-validation') return <AdminGradeValidation />;
  if (page === 'auto-report-sync') return <AutoReportSyncPanel />;
  if (page === 'cahier-cotation') return <CahierCotation />;
  if (page === 'admin-cotation-rules') return <AdminCotationRules />;
  if (page === 'admin-tuition') return <TuitionTracking />;
  if (page === 'caisse') return <CashierCaisse />;
  if (page === 'caisse-notifications') return <CashierNotifications />;
  if (page === 'admin-end-of-year') return <EndOfYear />;
  if (page === 'admin-ai') return <AdminAi />;
  if (page === 'teacher-dashboard') return <TeacherDashboard />;
  if (page === 'teacher-reports') return <TeacherCanonicalBulletins />;
  if (page === 'teacher-courses') return <TeacherCourses />;
  if (page === 'teacher-classes') return <TeacherClasses />;
  if (page === 'teacher-lessons') return <TeacherLessons />;
  if (page === 'teacher-grades') return <TeacherGrades />;
  if (page === 'teacher-homework') return <TeacherHomework />;
  if (page === 'teacher-documents') return <TeacherDocuments />;
  if (page === 'teacher-attendance') return <TeacherAttendance />;
  if (page === 'teacher-schedules') return <TeacherSchedules />;
  if (page === 'teacher-ai') return <TeacherAI />;
  if (page === 'teacher-notifications') return <TeacherNotifications />;
  if (page === 'teacher-end-of-year') return <EndOfYear />;
  if (page === 'student-dashboard') return <StudentDashboard />;
  if (page === 'student-courses') return <StudentCourses />;
  if (page === 'student-lessons') return <StudentLessons />;
  if (page === 'student-grades') return <StudentGrades />;
  if (page === 'student-bulletins') return <StudentBulletins />;
  if (page === 'student-attendance') return <StudentAttendance />;
  if (page === 'student-schedules') return <StudentSchedules />;
  if (page === 'student-ai') return <StudentAI />;
  if (page === 'student-homework') return <StudentHomework />;
  if (page === 'student-notifications') return <StudentNotifications />;
  if (page === 'student-payments') return <StudentPayments />;
  if (page === 'parent-dashboard') return <ParentDashboard />;
  if (page === 'parent-grades') return <ParentGrades />;
  if (page === 'parent-bulletins') return <ParentBulletins />;
  if (page === 'parent-payments') return <ParentPayments />;
  if (page === 'parent-notifications') return <ParentNotifications />;
  if (page === 'parent-ai') return <ParentAI />;
  if (page === 'profile') return <ProfilePage />;
  if (page === 'messages') return <ChatPage />;
  if (page === 'calendar') return <SchoolCalendar />;
  if (page === 'help') return <HelpPage />;
  if (page === 'sync-center') return <SyncCenter />;
  return <AuthPage />;
}

// Écran de chargement, réservé aux utilisateurs qui ont déjà une session locale :
// un visiteur doit voir la page d'accueil dès le rendu serveur (indexation + pas
// de blanc au premier affichage).
function SessionSplash() {
  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 animate-pulse">
        <Image src="/logo-mark.svg" alt="GradeUp" width={48} height={48} priority className="w-12 h-12" />
        <div className="h-2 w-24 rounded-full bg-muted" />
      </div>
    </div>
  );
}

/** Vrai si un utilisateur est resté dans le stockage local persisté du store. */
function hasStoredSession() {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem('gradeup-storage');
    return Boolean(raw && (JSON.parse(raw)?.state?.user ?? null));
  } catch {
    return false;
  }
}

export default function HomePage() {
  const { currentPage, user, hydrateSession, setUser, setCurrentPage } = useAppStore();
  const [hydrating, setHydrating] = useState(true);
  const [maybeLoggedIn] = useState(hasStoredSession);

  useEffect(() => {
    const uninstallFetchRecovery = installAuthenticatedFetchRecovery();
    const handleExpiredSession = () => {
      setUser(null);
      setCurrentPage('auth');
    };
    window.addEventListener('gradeup-session-expired', handleExpiredSession);
    hydrateSession().finally(() => setHydrating(false));
    return () => {
      window.removeEventListener('gradeup-session-expired', handleExpiredSession);
      uninstallFetchRecovery();
    };
  }, [hydrateSession, setCurrentPage, setUser]);

  if (hydrating && maybeLoggedIn) {
    return <SessionSplash />;
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <AppLayout>
      <PageRouter page={currentPage} />
    </AppLayout>
  );
}
