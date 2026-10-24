import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, AuthError } from '@/lib/auth/authenticate';
import { createNotification } from '@/services/notifications/createNotification';
import { auditFromRequest } from '@/lib/api/audit';
import { z } from 'zod';

const createNotificationSchema = z.object({
  schoolId: z.string().trim().min(1),
  targetRole: z.enum(['ALL', 'STUDENT', 'TEACHER', 'PARENT', 'CAISSIER', 'CLASS', 'USER']).default('ALL'),
  targetClassId: z.string().trim().optional(),
  targetUserId: z.string().trim().optional(),
  message: z.string().trim().min(1).max(5000),
  title: z.string().trim().max(200).optional(),
  type: z.enum([
    'INFO', 'SYSTEM', 'CONFERENCE', 'CARD', 'GRADE', 'CLASS', 'MESSAGE', 'PROFILE',
    'LESSON', 'HOMEWORK', 'HOMEWORK_SUBMISSION', 'ATTENDANCE', 'PAYMENT', 'REPORT_CARD', 'SCHEDULE_UPDATED',
  ]).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

async function getChildrenClassIds(schoolId: string, parentId: string): Promise<string[]> {
  const enrollments = await db.enrolledClass.findMany({
    where: {
      user: { schoolId, parentId, role: 'STUDENT', deletedAt: null },
      class: { schoolId, deletedAt: null },
    },
    select: { classId: true },
  });
  return [...new Set(enrollments.map((enrollment) => enrollment.classId))];
}

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    const { searchParams } = new URL(request.url);
    // Tenant forcé à la session : le paramètre schoolId du client est ignoré
    const schoolId = auth.schoolId;
    const targetRole = searchParams.get('targetRole');

    const where: Record<string, unknown> = { schoolId };

    if (auth.role === 'STUDENT') {
      const enrollments = await db.enrolledClass.findMany({
        where: { userId: auth.userId, class: { schoolId, deletedAt: null } },
        select: { classId: true },
      });
      const classIds = enrollments.map(e => e.classId);
      where.OR = [
        { userId: auth.userId },
        { targetRole: 'STUDENT' },
        { targetRole: 'ALL' },
        { targetRole: 'CLASS', targetClassId: { in: classIds } },
      ];
    } else if (auth.role === 'TEACHER') {
      const [courses, titularClasses] = await Promise.all([
        db.course.findMany({
          where: { schoolId, teacherId: auth.userId, deletedAt: null },
          select: { classId: true },
          distinct: ['classId'],
        }),
        db.schoolClass.findMany({
          where: { schoolId, titulaireId: auth.userId, deletedAt: null },
          select: { id: true },
        }),
      ]);
      const classIds = [...new Set([...courses.map((course) => course.classId), ...titularClasses.map((item) => item.id)])];
      where.OR = [
        { userId: auth.userId },
        { targetRole: 'TEACHER' },
        { targetRole: 'ALL' },
        { targetRole: 'CLASS', targetClassId: { in: classIds } },
      ];
    } else if (auth.role === 'PARENT') {
      where.OR = [
        { userId: auth.userId },
        { targetRole: 'PARENT' },
        { targetRole: 'ALL' },
        { targetRole: 'CLASS', targetClassId: { in: await getChildrenClassIds(schoolId, auth.userId) } },
      ];
    } else if (auth.role === 'CAISSIER') {
      where.OR = [
        { userId: auth.userId },
        { targetRole: 'CAISSIER' },
        { targetRole: 'ALL' },
      ];
    } else if (targetRole) {
      where.targetRole = targetRole;
    }

    if (auth.role !== 'ADMIN') {
      where.AND = [{ OR: [{ userId: auth.userId }, { userId: null }] }];
    }

    const notifications = await db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (targetRole === auth.role && ['STUDENT', 'PARENT', 'TEACHER', 'CAISSIER'].includes(auth.role)) {
      return NextResponse.json(notifications);
    }

    return NextResponse.json({ notifications });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Seul un administrateur peut diffuser une notification.' }, { status: 403 });
    }
    const parsed = createNotificationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données de notification invalides.', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const body = parsed.data;

    // Multi-tenant : impossible de créer une notification dans une autre école
    if (body.schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }
    if (body.targetRole === 'CLASS') {
      if (!body.targetClassId) {
        return NextResponse.json({ error: 'Une classe cible est requise.' }, { status: 400 });
      }
      const targetClass = await db.schoolClass.findFirst({
        where: { id: body.targetClassId, schoolId: auth.schoolId, deletedAt: null },
        select: { id: true },
      });
      if (!targetClass) {
        return NextResponse.json({ error: 'Classe cible introuvable dans cet établissement.' }, { status: 404 });
      }
    }

    let targetUserId: string | null = null;
    if (body.targetRole === 'USER') {
      if (!body.targetUserId) return NextResponse.json({ error: 'Un utilisateur cible est requis.' }, { status: 400 });
      const targetUser = await db.user.findFirst({
        where: { id: body.targetUserId, schoolId: auth.schoolId, active: true, deletedAt: null },
        select: { id: true },
      });
      if (!targetUser) return NextResponse.json({ error: 'Utilisateur cible introuvable dans cet établissement.' }, { status: 404 });
      targetUserId = targetUser.id;
    } else if (body.targetUserId) {
      return NextResponse.json({ error: 'targetUserId ne s’utilise que pour un destinataire précis.' }, { status: 400 });
    }

    const notification = await createNotification({
      schoolId: auth.schoolId,
      userId: targetUserId,
      senderId: auth.userId,
      targetRole: body.targetRole,
      targetClassId: body.targetRole === 'CLASS' ? body.targetClassId! : '',
      message: body.message,
      title: body.title || 'GradeUp',
      type: body.type || 'INFO',
      priority: body.priority || 'NORMAL',
      metadata: body.metadata || {},
    });

    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'NOTIFICATION_BROADCAST_CREATE',
      entity: 'Notification',
      entityId: notification.id,
      after: { targetRole: body.targetRole, targetClassId: body.targetClassId || null, targetUserId, type: body.type || 'INFO' },
    });

    return NextResponse.json({ notification }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
