import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { emitNotification } from '@/services/notifications/emitNotification';
import type { AuthUser } from '@/lib/auth/authenticate';
import type { AnnouncementAudience } from './audience';

export interface ViewerContext {
  classIds: string[];
  childIds: string[];
}

/**
 * Contexte de visibilité d'un utilisateur : ses classes (élève), les classes de
 * ses enfants (parent) ou les classes qu'il enseigne (professeur).
 */
export async function getViewerContext(auth: AuthUser): Promise<ViewerContext> {
  if (auth.role === 'STUDENT') {
    const enrollments = await db.enrolledClass.findMany({
      where: {
        userId: auth.userId,
        class: { schoolId: auth.schoolId, deletedAt: null },
      },
      select: { classId: true },
    });
    return { classIds: [...new Set(enrollments.map((item) => item.classId))], childIds: [] };
  }

  if (auth.role === 'PARENT') {
    const [children, enrollments] = await Promise.all([
      db.user.findMany({
        where: { schoolId: auth.schoolId, parentId: auth.userId, role: 'STUDENT', active: true, deletedAt: null },
        select: { id: true },
      }),
      db.enrolledClass.findMany({
        where: {
          class: { schoolId: auth.schoolId, deletedAt: null },
          user: { schoolId: auth.schoolId, parentId: auth.userId, role: 'STUDENT', active: true, deletedAt: null },
        },
        select: { classId: true },
      }),
    ]);
    return {
      classIds: [...new Set(enrollments.map((item) => item.classId))],
      childIds: children.map((child) => child.id),
    };
  }

  if (auth.role === 'TEACHER') {
    const [courses, titularClasses] = await Promise.all([
      db.course.findMany({
        where: { schoolId: auth.schoolId, teacherId: auth.userId, deletedAt: null },
        select: { classId: true },
        distinct: ['classId'],
      }),
      db.schoolClass.findMany({
        where: { schoolId: auth.schoolId, titulaireId: auth.userId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    return {
      classIds: [...new Set([
        ...courses.map((course) => course.classId),
        ...titularClasses.map((item) => item.id),
      ])],
      childIds: [],
    };
  }

  return { classIds: [], childIds: [] };
}

/**
 * Filtre d'audience appliqué à la boîte de réception. Il ne contient pas les
 * filtres d'école/suppression : l'appelant les ajoute.
 */
export async function buildAudienceWhere(auth: AuthUser): Promise<Prisma.AnnouncementWhereInput> {
  const context = await getViewerContext(auth);
  const or: Prisma.AnnouncementWhereInput[] = [
    { audienceType: 'ALL' },
    { targetRoles: { has: auth.role } },
    { targetUserIds: { has: auth.userId } },
  ];

  if (context.childIds.length > 0) {
    or.push({ targetUserIds: { hasSome: context.childIds } });
  }
  if (context.classIds.length > 0) {
    or.push({ targetClassIds: { hasSome: context.classIds } });
  }

  return { OR: or };
}

/** Vérifie que les classes et utilisateurs choisis existent bien dans l'école. */
export async function validateAudienceTargets(
  schoolId: string,
  audience: AnnouncementAudience,
): Promise<string | null> {
  if (audience.audienceType === 'CLASSES') {
    const found = await db.schoolClass.count({
      where: { id: { in: audience.targetClassIds }, schoolId, deletedAt: null },
    });
    if (found !== audience.targetClassIds.length) {
      return 'Une ou plusieurs classes choisies n’existent pas dans cet établissement.';
    }
    return null;
  }

  if (audience.audienceType === 'STUDENTS') {
    const schoolClass = await db.schoolClass.findFirst({
      where: { id: audience.contextClassId, schoolId, deletedAt: null },
      select: { id: true },
    });
    if (!schoolClass) {
      return 'La classe choisie n’existe pas dans cet établissement.';
    }

    const students = await db.user.count({
      where: {
        id: { in: audience.targetUserIds },
        schoolId,
        role: 'STUDENT',
        active: true,
        deletedAt: null,
        classEnrollments: {
          some: { classId: audience.contextClassId, class: { schoolId, deletedAt: null } },
        },
      },
    });
    if (students !== audience.targetUserIds.length) {
      return 'Un ou plusieurs élèves ne font pas partie de la classe choisie.';
    }
    return null;
  }

  if (audience.audienceType === 'USERS') {
    const found = await db.user.count({
      where: { id: { in: audience.targetUserIds }, schoolId, active: true, deletedAt: null },
    });
    if (found !== audience.targetUserIds.length) {
      return 'Une ou plusieurs personnes choisies n’existent pas dans cet établissement.';
    }
  }

  return null;
}

/**
 * Résout la liste unique des destinataires.
 * - CLASSES : élèves inscrits + leurs parents.
 * - STUDENTS : élèves choisis + leurs parents.
 * - USERS : uniquement les personnes choisies.
 */
export async function resolveAnnouncementRecipients(
  schoolId: string,
  audience: AnnouncementAudience,
): Promise<string[]> {
  const recipients = new Set<string>();

  if (audience.audienceType === 'ALL') {
    const users = await db.user.findMany({
      where: { schoolId, active: true, deletedAt: null },
      select: { id: true },
    });
    for (const user of users) recipients.add(user.id);
  } else if (audience.audienceType === 'ROLES') {
    const users = await db.user.findMany({
      where: {
        schoolId,
        active: true,
        deletedAt: null,
        role: { in: audience.targetRoles },
      },
      select: { id: true },
    });
    for (const user of users) recipients.add(user.id);
  } else if (audience.audienceType === 'CLASSES') {
    const enrollments = await db.enrolledClass.findMany({
      where: {
        classId: { in: audience.targetClassIds },
        class: { schoolId, deletedAt: null },
        user: { schoolId, role: 'STUDENT', active: true, deletedAt: null },
      },
      select: { userId: true, user: { select: { parentId: true } } },
    });
    for (const enrollment of enrollments) {
      recipients.add(enrollment.userId);
      if (enrollment.user.parentId) recipients.add(enrollment.user.parentId);
    }
  } else if (audience.audienceType === 'STUDENTS') {
    const students = await db.user.findMany({
      where: {
        id: { in: audience.targetUserIds },
        schoolId,
        role: 'STUDENT',
        active: true,
        deletedAt: null,
        classEnrollments: {
          some: { classId: audience.contextClassId, class: { schoolId, deletedAt: null } },
        },
      },
      select: { id: true, parentId: true },
    });
    for (const student of students) {
      recipients.add(student.id);
      if (student.parentId) recipients.add(student.parentId);
    }
  } else if (audience.audienceType === 'USERS') {
    const users = await db.user.findMany({
      where: { id: { in: audience.targetUserIds }, schoolId, active: true, deletedAt: null },
      select: { id: true },
    });
    for (const user of users) recipients.add(user.id);
  }

  return [...recipients];
}

interface AnnouncementNotificationInput {
  schoolId: string;
  authorId: string;
  announcementId: string;
  title: string;
  content: string;
  category: string;
  priority: string;
  userIds: string[];
}

/**
 * Crée une notification in-app par destinataire (avec le logo GradeUp) et
 * diffuse l'événement temps réel. Aucun push n'est envoyé ici : le module
 * Communiqués reste consultable hors ligne et le parent retrouve le message
 * dans son interface.
 */
export async function createAnnouncementNotifications(input: AnnouncementNotificationInput): Promise<void> {
  if (input.userIds.length === 0) return;

  const now = new Date();
  const notificationPriority = input.priority === 'URGENT'
    ? 'URGENT'
    : input.priority === 'IMPORTANT'
      ? 'HIGH'
      : 'NORMAL';
  const message = input.content.length > 600
    ? `${input.content.slice(0, 597).trimEnd()}...`
    : input.content;
  const metadata = JSON.stringify({
    announcementId: input.announcementId,
    logo: '/logo-gradeup.png',
    url: '/announcements',
    category: input.category,
  });

  const rows = input.userIds.map((userId) => ({
    id: randomUUID(),
    schoolId: input.schoolId,
    userId,
    senderId: input.authorId,
    title: `Communiqué : ${input.title}`,
    message,
    type: 'ANNOUNCEMENT',
    priority: notificationPriority,
    read: false,
    metadata,
    targetRole: 'USER',
    targetClassId: '',
    createdAt: now,
    updatedAt: now,
  }));

  // Découpage en lots pour rester sous la limite de paramètres PostgreSQL.
  for (let index = 0; index < rows.length; index += 200) {
    const batch = rows.slice(index, index + 200);
    await db.notification.createMany({ data: batch });
    for (const row of batch) {
      emitNotification({
        id: row.id,
        schoolId: row.schoolId,
        userId: row.userId,
        senderId: row.senderId,
        title: row.title,
        message: row.message,
        type: row.type,
        priority: row.priority,
        read: row.read,
        metadata: row.metadata,
        targetRole: row.targetRole,
        targetClassId: row.targetClassId,
        createdAt: row.createdAt,
      });
    }
  }
}
