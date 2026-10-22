import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Settings,
  BarChart3,
  Bell,
  BookOpen,
  FileText,
  ClipboardList,
  ClipboardCheck,
  Calendar,
  Bot,
  User,
  MessageSquare,
  CalendarDays,
  School,
  Lightbulb,
  Video,
  Library,
  IdCard,
  DollarSign,
  GraduationCap,
  ScrollText,
  Zap,
  Award,
  SlidersHorizontal,
  PenLine,
} from 'lucide-react';
import type { PageView, UserRole } from '@/lib/types';

/**
 * Source unique de vérité pour toute la navigation.
 * Plus aucune liste de menus en dur ailleurs : app-layout et le palette de
 * commandes consomment uniquement ce module.
 */

export interface NavItem {
  label: string;
  page: PageView;
  icon: LucideIcon;
  emoji: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  CAISSIER: 'Caissier',
  TEACHER: 'Professeur',
  STUDENT: 'Élève',
  PARENT: 'Parent',
};

export const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  ADMIN: 'bg-blue-100 text-blue-700',
  TEACHER: 'bg-emerald-100 text-emerald-700',
  STUDENT: 'bg-violet-100 text-violet-700',
  PARENT: 'bg-amber-100 text-amber-700',
};

/** Menu complet par rôle (sidebar desktop/tablette + tiroir « Plus » mobile). */
export const NAV_ITEMS_BY_ROLE: Record<UserRole, NavItem[]> = {
  ADMIN: [
    { label: 'Tableau de bord', page: 'admin-dashboard', icon: LayoutDashboard, emoji: '📊' },
    { label: 'Utilisateurs', page: 'admin-users', icon: Users, emoji: '👥' },
    { label: 'Classes', page: 'admin-classes', icon: School, emoji: '🏫' },
    { label: 'Paiements', page: 'admin-payments', icon: CreditCard, emoji: '💳' },
    { label: 'Frais scolaires', page: 'admin-tuition', icon: DollarSign, emoji: '💰' },
    { label: 'Cartes Élèves', page: 'admin-cards', icon: IdCard, emoji: '🆔' },
    { label: 'Configuration', page: 'admin-config', icon: Settings, emoji: '⚙️' },
    { label: 'Présence', page: 'admin-presence', icon: ClipboardCheck, emoji: '✅' },
    { label: 'Rapports', page: 'admin-reports', icon: BarChart3, emoji: '📈' },
    { label: 'Notifications', page: 'admin-notifications', icon: Bell, emoji: '🔔' },
    { label: 'Visioconférences', page: 'admin-conferences', icon: Video, emoji: '🎥' },
    { label: 'Cours', page: 'admin-courses', icon: BookOpen, emoji: '📚' },
    { label: 'Emploi du temps', page: 'admin-schedules', icon: CalendarDays, emoji: '🗓️' },
    { label: 'Bulletins Sync', page: 'auto-report-sync', icon: Zap, emoji: '⚡' },
    { label: 'Cotation & Délibération RDC', page: 'admin-cotation-rules', icon: SlidersHorizontal, emoji: '⚖️' },
    { label: 'Calendrier des périodes', page: 'admin-school-calendar', icon: CalendarDays, emoji: '🗓️' },
    { label: 'Passages', page: 'admin-passages', icon: GraduationCap, emoji: '🎓' },
    { label: 'Demandes de notes', page: 'admin-note-modifications', icon: PenLine, emoji: '✍️' },
    { label: 'Validation des notes', page: 'admin-grade-validation', icon: ClipboardCheck, emoji: '✅' },
    { label: 'IA Gradie', page: 'admin-ai', icon: Bot, emoji: '🤖' },
    { label: 'Visioconférences', page: 'meetings', icon: Video, emoji: '🎥' },
    { label: 'Bibliothèque', page: 'library', icon: Library, emoji: '📚' },
    { label: 'Fin du cursus', page: 'admin-end-of-year', icon: GraduationCap, emoji: '🎓' },
    { label: 'Messagerie', page: 'messages', icon: MessageSquare, emoji: '💬' },
    { label: 'Calendrier', page: 'calendar', icon: CalendarDays, emoji: '📆' },
    { label: 'Profil', page: 'profile', icon: User, emoji: '👤' },
    { label: 'Hors ligne & Sync', page: 'sync-center', icon: Zap, emoji: '🔄' },
    { label: 'Aide', page: 'help', icon: Lightbulb, emoji: '💡' },
  ],
  CAISSIER: [
    { label: 'Caisse', page: 'caisse', icon: DollarSign, emoji: '💵' },
    { label: 'Profil', page: 'profile', icon: User, emoji: '👤' },
    { label: 'Aide', page: 'help', icon: Lightbulb, emoji: '💡' },
  ],
  TEACHER: [
    { label: 'Tableau de bord', page: 'teacher-dashboard', icon: LayoutDashboard, emoji: '📊' },
    { label: 'Cours', page: 'teacher-courses', icon: BookOpen, emoji: '📚' },
    { label: 'Mes Classes', page: 'teacher-classes', icon: School, emoji: '🏫' },
    { label: 'Emploi du temps', page: 'teacher-schedules', icon: CalendarDays, emoji: '🗓️' },
    { label: 'Notes', page: 'teacher-grades', icon: ClipboardList, emoji: '📝' },
    { label: 'Devoirs', page: 'teacher-homework', icon: ClipboardCheck, emoji: '📋' },
    { label: 'Documents', page: 'teacher-documents', icon: FileText, emoji: '📄' },
    { label: 'Absences', page: 'teacher-attendance', icon: Calendar, emoji: '📅' },
    { label: 'IA Gradie', page: 'teacher-ai', icon: Bot, emoji: '🤖' },
    { label: 'Visioconférences', page: 'meetings', icon: Video, emoji: '🎥' },
    { label: 'Bibliothèque', page: 'library', icon: Library, emoji: '📚' },
    { label: 'Bulletins', page: 'teacher-reports', icon: ScrollText, emoji: '📄' },
    { label: 'Notifications', page: 'teacher-notifications', icon: Bell, emoji: '🔔' },
    { label: 'Bulletins Sync', page: 'auto-report-sync', icon: Zap, emoji: '⚡' },
    { label: 'Cahier de Cotation', page: 'cahier-cotation', icon: ClipboardList, emoji: '📖' },
    { label: 'Demandes de notes', page: 'admin-note-modifications', icon: PenLine, emoji: '✍️' },
    { label: 'Fin du cursus', page: 'teacher-end-of-year', icon: GraduationCap, emoji: '🎓' },
    { label: 'Messagerie', page: 'messages', icon: MessageSquare, emoji: '💬' },
    { label: 'Calendrier', page: 'calendar', icon: CalendarDays, emoji: '📆' },
    { label: 'Profil', page: 'profile', icon: User, emoji: '👤' },
    { label: 'Hors ligne & Sync', page: 'sync-center', icon: Zap, emoji: '🔄' },
    { label: 'Aide', page: 'help', icon: Lightbulb, emoji: '💡' },
  ],
  STUDENT: [
    { label: 'Tableau de bord', page: 'student-dashboard', icon: LayoutDashboard, emoji: '📊' },
    { label: 'Cours', page: 'student-courses', icon: BookOpen, emoji: '📚' },
    { label: 'Emploi du temps', page: 'student-schedules', icon: CalendarDays, emoji: '🗓️' },
    { label: 'Leçons', page: 'student-lessons', icon: FileText, emoji: '📖' },
    { label: 'Notes', page: 'student-grades', icon: ClipboardList, emoji: '📝' },
    { label: 'Bulletins', page: 'student-bulletins', icon: Award, emoji: '🏆' },
    { label: 'Devoirs', page: 'student-homework', icon: ClipboardCheck, emoji: '📋' },
    { label: 'Absences', page: 'student-attendance', icon: Calendar, emoji: '📅' },
    { label: 'Étudier avec Grady', page: 'student-ai', icon: Bot, emoji: '🤖' },
    { label: 'Visioconférences', page: 'meetings', icon: Video, emoji: '🎥' },
    { label: 'Bibliothèque', page: 'library', icon: Library, emoji: '📚' },
    { label: 'Notifications', page: 'student-notifications', icon: Bell, emoji: '🔔' },
    { label: 'Messagerie', page: 'messages', icon: MessageSquare, emoji: '💬' },
    { label: 'Calendrier', page: 'calendar', icon: CalendarDays, emoji: '📆' },
    { label: 'Profil', page: 'profile', icon: User, emoji: '👤' },
    { label: 'Hors ligne & Sync', page: 'sync-center', icon: Zap, emoji: '🔄' },
    { label: 'Aide', page: 'help', icon: Lightbulb, emoji: '💡' },
  ],
  PARENT: [
    { label: 'Tableau de bord', page: 'parent-dashboard', icon: LayoutDashboard, emoji: '📊' },
    { label: 'Suivi scolaire', page: 'parent-grades', icon: BarChart3, emoji: '📊' },
    { label: 'Bulletins', page: 'parent-bulletins', icon: Award, emoji: '🏆' },
    { label: 'Paiements', page: 'parent-payments', icon: CreditCard, emoji: '💳' },
    { label: 'IA Gradie', page: 'parent-ai', icon: Bot, emoji: '🤖' },
    { label: 'Visioconférences', page: 'meetings', icon: Video, emoji: '🎥' },
    { label: 'Bibliothèque', page: 'library', icon: Library, emoji: '📚' },
    { label: 'Notifications', page: 'parent-notifications', icon: Bell, emoji: '🔔' },
    { label: 'Messagerie', page: 'messages', icon: MessageSquare, emoji: '💬' },
    { label: 'Profil', page: 'profile', icon: User, emoji: '👤' },
    { label: 'Hors ligne & Sync', page: 'sync-center', icon: Zap, emoji: '🔄' },
    { label: 'Aide', page: 'help', icon: Lightbulb, emoji: '💡' },
  ],
};

/**
 * Onglets primaires de la bottom nav mobile (4 maximum).
 * Le 5e emplacement est toujours le bouton « Plus » (tiroir avec le reste).
 */
export const PRIMARY_TABS_BY_ROLE: Record<UserRole, NavItem[]> = {
  ADMIN: [
    { label: 'Accueil', page: 'admin-dashboard', icon: LayoutDashboard, emoji: '📊' },
    { label: 'Classes', page: 'admin-classes', icon: School, emoji: '🏫' },
    { label: 'Paiements', page: 'admin-payments', icon: CreditCard, emoji: '💳' },
    { label: 'Profil', page: 'profile', icon: User, emoji: '👤' },
  ],
  CAISSIER: [
    { label: 'Caisse', page: 'caisse', icon: DollarSign, emoji: '💵' },
    { label: 'Profil', page: 'profile', icon: User, emoji: '👤' },
  ],
  TEACHER: [
    { label: 'Accueil', page: 'teacher-dashboard', icon: LayoutDashboard, emoji: '📊' },
    { label: 'Notes', page: 'teacher-grades', icon: ClipboardList, emoji: '📝' },
    { label: 'Devoirs', page: 'teacher-homework', icon: ClipboardCheck, emoji: '📋' },
    { label: 'Profil', page: 'profile', icon: User, emoji: '👤' },
  ],
  STUDENT: [
    { label: 'Accueil', page: 'student-dashboard', icon: LayoutDashboard, emoji: '📊' },
    { label: 'Notes', page: 'student-grades', icon: ClipboardList, emoji: '📝' },
    { label: 'Devoirs', page: 'student-homework', icon: ClipboardCheck, emoji: '📋' },
    { label: 'Profil', page: 'profile', icon: User, emoji: '👤' },
  ],
  PARENT: [
    { label: 'Accueil', page: 'parent-dashboard', icon: LayoutDashboard, emoji: '📊' },
    { label: 'Suivi', page: 'parent-grades', icon: BarChart3, emoji: '📊' },
    { label: 'Paiements', page: 'parent-payments', icon: CreditCard, emoji: '💳' },
    { label: 'Profil', page: 'profile', icon: User, emoji: '👤' },
  ],
};

export const PAGE_TITLES: Record<PageView, string> = {
  auth: 'Connexion',
  register: 'Inscription',
  'admin-dashboard': 'Tableau de bord',
  'admin-users': 'Utilisateurs',
  'admin-classes': 'Classes',
  'admin-payments': 'Paiements',
  'admin-config': 'Configuration',
  'admin-reports': 'Rapports',
  'admin-notifications': 'Notifications',
  'admin-conferences': 'Visioconférences',
  meetings: 'Visioconférences Grada Vio',
  'meeting-room': 'Réunion en cours',
  library: 'Bibliothèque Numérique',
  'admin-cards': "Cartes d'identité",
  'admin-courses': 'Cours',
  'admin-ai': 'IA Gradie',
  'admin-tuition': 'Frais scolaires',
  'admin-presence': 'Module de Présence',
  'admin-schedules': 'Gestion des Emplois du Temps',
  'admin-school-calendar': 'Calendrier des périodes',
  'admin-coefficients': 'Coefficients des matières',
  'admin-passages': 'Passages et promotions',
  'admin-note-modifications': 'Demandes de modification de notes',
  'admin-grade-validation': 'Validation des notes',
  'auto-report-sync': 'Bulletins Synchronisés',
  'cahier-cotation': 'Cahier de Cotation RDC',
  'admin-cotation-rules': 'Cotation & Délibération RDC',
  'admin-end-of-year': 'Fin du cursus',
  caisse: 'Caisse',
  'teacher-dashboard': 'Tableau de bord',
  'teacher-courses': 'Cours',
  'teacher-classes': 'Mes Classes',
  'teacher-lessons': 'Leçons',
  'teacher-grades': 'Notes',
  'teacher-homework': 'Devoirs',
  'teacher-documents': 'Documents pédagogiques',
  'teacher-attendance': 'Absences',
  'teacher-schedules': 'Emploi du temps',
  'teacher-ai': 'IA Gradie',
  'teacher-reports': 'Bulletins',
  'teacher-notifications': 'Notifications',
  'teacher-end-of-year': 'Fin du cursus',
  'student-dashboard': 'Tableau de bord',
  'student-courses': 'Cours',
  'student-lessons': 'Leçons',
  'student-grades': 'Notes',
  'student-bulletins': 'Bulletins',
  'student-attendance': 'Absences',
  'student-schedules': 'Emploi du temps',
  'student-ai': 'IA Gradie',
  'student-homework': 'Devoirs',
  'student-notifications': 'Notifications',
  'student-payments': 'Paiements élève',
  'parent-dashboard': 'Tableau de bord',
  'parent-grades': 'Suivi scolaire',
  'parent-bulletins': 'Bulletins',
  'parent-payments': 'Paiements',
  'parent-notifications': 'Notifications',
  'parent-ai': 'IA Gradie',
  profile: 'Profil',
  messages: 'Messagerie',
  calendar: 'Calendrier',
  help: "Centre d'aide",
  'sync-center': 'Centre de synchronisation',
};

export const PAGE_HELP: Partial<Record<PageView, string>> = {
  'admin-dashboard': 'Consultez les indicateurs principaux de votre établissement.',
  'admin-users': 'Gérez les comptes, rôles et informations des utilisateurs.',
  'admin-notifications': "Consultez et gérez les notifications envoyées dans l'établissement.",
  'teacher-dashboard': 'Retrouvez un résumé de vos cours et activités.',
  'teacher-grades': 'Ajoutez les notes. Au primaire, le trimestre est calculé depuis la date.',
  'teacher-notifications': 'Consultez vos notifications et marquez-les comme lues.',
  'student-grades': 'Consultez vos notes et moyennes par période.',
  'student-notifications': "Consultez les informations envoyées par votre établissement.",
  'parent-grades': 'Suivez les notes et moyennes de vos enfants.',
  'parent-notifications': 'Consultez les informations concernant vos enfants.',
};

function filterForRole(items: NavItem[], role: UserRole, isTitulaire?: boolean): NavItem[] {
  if (role === 'TEACHER' && !isTitulaire) {
    return items.filter((item) => item.page !== 'teacher-reports' && item.page !== 'auto-report-sync');
  }
  return items;
}

/** Menu complet filtré selon le rôle et le statut de titulaire. */
export function getNavItems(role: UserRole, isTitulaire?: boolean): NavItem[] {
  return filterForRole(NAV_ITEMS_BY_ROLE[role] || [], role, isTitulaire);
}

/** Onglets primaires de la bottom nav (4 max). */
export function getPrimaryTabs(role: UserRole, isTitulaire?: boolean): NavItem[] {
  return filterForRole(PRIMARY_TABS_BY_ROLE[role] || [], role, isTitulaire);
}

/** Modules restants, affichés dans le tiroir « Plus » (mobile). */
export function getMoreItems(role: UserRole, isTitulaire?: boolean): NavItem[] {
  const primaryPages = new Set(getPrimaryTabs(role, isTitulaire).map((t) => t.page));
  return getNavItems(role, isTitulaire).filter((item) => !primaryPages.has(item.page));
}

/** Vrai si la page courante vit dans le tiroir « Plus ». */
export function isMoreItemActive(role: UserRole, page: PageView, isTitulaire?: boolean): boolean {
  return getMoreItems(role, isTitulaire).some((item) => item.page === page);
}
