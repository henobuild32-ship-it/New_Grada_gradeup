/**
 * Règles d'audience des communiqués.
 *
 * Ce module est volontairement pur (aucun accès base de données) : il est
 * utilisé par l'API, par l'interface et par les tests. La résolution finale des
 * destinataires reste toujours faite côté serveur.
 */

export const ANNOUNCEMENT_ROLES = [
  'ADMIN',
  'TEACHER',
  'STUDENT',
  'PARENT',
  'CAISSIER',
  'LECTEUR',
] as const;

export type AnnouncementRole = (typeof ANNOUNCEMENT_ROLES)[number];

export const ANNOUNCEMENT_ROLE_LABELS: Record<AnnouncementRole, string> = {
  ADMIN: 'Administrateurs',
  TEACHER: 'Professeurs',
  STUDENT: 'Élèves',
  PARENT: 'Parents',
  CAISSIER: 'Caissiers',
  LECTEUR: 'Lecteurs',
};

export const ANNOUNCEMENT_CATEGORIES = [
  'GENERAL',
  'ACADEMIC',
  'FINANCIAL',
  'EVENT',
  'REMINDER',
  'URGENT',
] as const;

export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export const ANNOUNCEMENT_CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  GENERAL: 'Général',
  ACADEMIC: 'Académique',
  FINANCIAL: 'Financier',
  EVENT: 'Événement',
  REMINDER: 'Rappel',
  URGENT: 'Urgent',
};

export const ANNOUNCEMENT_PRIORITIES = ['NORMAL', 'IMPORTANT', 'URGENT'] as const;

export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number];

export const ANNOUNCEMENT_PRIORITY_LABELS: Record<AnnouncementPriority, string> = {
  NORMAL: 'Normale',
  IMPORTANT: 'Importante',
  URGENT: 'Urgente',
};

export const ANNOUNCEMENT_AUDIENCE_TYPES = [
  'ALL',
  'ROLES',
  'CLASSES',
  'STUDENTS',
  'USERS',
] as const;

export type AnnouncementAudienceType = (typeof ANNOUNCEMENT_AUDIENCE_TYPES)[number];

export const ANNOUNCEMENT_AUDIENCE_LABELS: Record<AnnouncementAudienceType, string> = {
  ALL: 'Tout le monde',
  ROLES: 'Par rôle',
  CLASSES: 'Élèves de classes',
  STUDENTS: 'Élèves précis',
  USERS: 'Personnes précises',
};

export interface AnnouncementAudience {
  audienceType: AnnouncementAudienceType;
  targetRoles: string[];
  targetClassIds: string[];
  targetUserIds: string[];
  contextClassId: string;
}

export interface AnnouncementAudienceInput {
  audienceType?: string | null;
  targetRoles?: unknown;
  targetClassIds?: unknown;
  targetUserIds?: unknown;
  contextClassId?: string | null;
}

export interface AnnouncementViewer {
  role: string;
  userId: string;
  /** Classes de l'élève, des enfants (parent) ou des classes enseignées. */
  classIds?: string[];
  /** Identifiants des enfants rattachés à un parent. */
  childIds?: string[];
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(
    values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}

export function isAnnouncementRole(value: string): value is AnnouncementRole {
  return (ANNOUNCEMENT_ROLES as readonly string[]).includes(value);
}

export function isAnnouncementCategory(value: string): value is AnnouncementCategory {
  return (ANNOUNCEMENT_CATEGORIES as readonly string[]).includes(value);
}

export function isAnnouncementPriority(value: string): value is AnnouncementPriority {
  return (ANNOUNCEMENT_PRIORITIES as readonly string[]).includes(value);
}

export function isAnnouncementAudienceType(value: string): value is AnnouncementAudienceType {
  return (ANNOUNCEMENT_AUDIENCE_TYPES as readonly string[]).includes(value);
}

/** Nettoie les tableaux reçus du client (doublons, vides, rôles inconnus). */
export function normalizeAudience(input: AnnouncementAudienceInput): AnnouncementAudience {
  const rawType = typeof input.audienceType === 'string' ? input.audienceType.trim().toUpperCase() : 'ALL';
  const audienceType = isAnnouncementAudienceType(rawType) ? rawType : 'ALL';

  return {
    audienceType,
    targetRoles: uniqueStrings(input.targetRoles).filter(isAnnouncementRole),
    targetClassIds: uniqueStrings(input.targetClassIds),
    targetUserIds: uniqueStrings(input.targetUserIds),
    contextClassId: typeof input.contextClassId === 'string' ? input.contextClassId.trim() : '',
  };
}

/**
 * Vérifie la cohérence de l'audience. Les contrôles d'existence (classe,
 * utilisateur, appartenance élève/classe) sont faits par l'API.
 */
export function validateAudience(audience: AnnouncementAudience): string | null {
  switch (audience.audienceType) {
    case 'ALL':
      return null;
    case 'ROLES':
      return audience.targetRoles.length > 0 ? null : 'Choisissez au moins un rôle destinataire.';
    case 'CLASSES':
      return audience.targetClassIds.length > 0 ? null : 'Choisissez au moins une classe.';
    case 'STUDENTS':
      if (audience.targetUserIds.length === 0) return 'Choisissez au moins un élève.';
      if (!audience.contextClassId) return 'Choisissez d’abord la classe de l’élève.';
      return null;
    case 'USERS':
      return audience.targetUserIds.length > 0 ? null : 'Choisissez au moins une personne.';
    default:
      return 'Type d’audience invalide.';
  }
}

/**
 * Indique si un communiqué doit apparaître dans la boîte de réception d'un
 * utilisateur. L'administrateur et le lecteur voient tout via leurs écrans
 * dédiés ; cette fonction sert aux autres rôles.
 */
export function announcementMatchesViewer(
  announcement: Pick<AnnouncementAudience, 'audienceType' | 'targetRoles' | 'targetClassIds' | 'targetUserIds'>,
  viewer: AnnouncementViewer,
): boolean {
  if (announcement.audienceType === 'ALL') return true;

  if (announcement.targetRoles.includes(viewer.role)) return true;
  if (announcement.targetUserIds.includes(viewer.userId)) return true;
  if (viewer.childIds?.some((childId) => announcement.targetUserIds.includes(childId))) return true;

  const classIds = viewer.classIds ?? [];
  if (classIds.length > 0 && announcement.targetClassIds.some((classId) => classIds.includes(classId))) {
    return true;
  }

  return false;
}

export function describeAudience(
  audience: Pick<AnnouncementAudience, 'audienceType' | 'targetRoles' | 'targetClassIds' | 'targetUserIds'>,
  classNames: Record<string, string> = {},
): string {
  switch (audience.audienceType) {
    case 'ALL':
      return 'Tout le monde';
    case 'ROLES': {
      const roles = audience.targetRoles
        .filter(isAnnouncementRole)
        .map((role) => ANNOUNCEMENT_ROLE_LABELS[role]);
      return roles.length > 0 ? roles.join(', ') : 'Rôles sélectionnés';
    }
    case 'CLASSES': {
      const names = audience.targetClassIds.map((id) => classNames[id] || 'Classe');
      return names.length > 0
        ? `${names.join(', ')} (élèves et parents)`
        : 'Classes sélectionnées';
    }
    case 'STUDENTS':
      return `${audience.targetUserIds.length} élève(s) sélectionné(s) et leurs parents`;
    case 'USERS':
      return `${audience.targetUserIds.length} personne(s) sélectionnée(s)`;
    default:
      return 'Destinataires';
  }
}
