import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { notifyUser } from '@/services/notifications/notificationEngine';
import { auditFromRequest } from '@/lib/api/audit';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const teacherId = searchParams.get('teacherId');
    const classId = searchParams.get('classId');

    if (!schoolId || schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'schoolId invalide' }, { status: 400 });
    }

    const where: Record<string, unknown> = { schoolId, deletedAt: null };

    if (auth.role === 'ADMIN' || auth.role === 'LECTEUR') {
      if (teacherId) where.teacherId = teacherId;
      if (classId) where.classId = classId;
    } else if (auth.role === 'TEACHER') {
      if (teacherId && teacherId !== auth.userId) {
        return NextResponse.json({ error: 'Accès limité à vos cours.' }, { status: 403 });
      }
      where.teacherId = auth.userId;
      if (classId) {
        const assigned = await db.course.findFirst({
          where: { schoolId, teacherId: auth.userId, classId, deletedAt: null },
          select: { id: true },
        });
        if (!assigned) return NextResponse.json({ error: 'Accès non autorisé à cette classe.' }, { status: 403 });
        where.classId = classId;
      }
    } else if (auth.role === 'STUDENT' || auth.role === 'PARENT') {
      const children = auth.role === 'STUDENT'
        ? [{ id: auth.userId }]
        : await db.user.findMany({
            where: { parentId: auth.userId, schoolId, role: 'STUDENT', active: true, deletedAt: null },
            select: { id: true },
          });
      const enrollments = await db.enrolledClass.findMany({
        where: { userId: { in: children.map((child) => child.id) }, class: { schoolId } },
        select: { classId: true },
      });
      const classIds = [...new Set(enrollments.map((enrollment) => enrollment.classId))];
      if (classId && !classIds.includes(classId)) {
        return NextResponse.json({ error: 'Accès non autorisé à cette classe.' }, { status: 403 });
      }
      where.classId = { in: classId ? [classId] : classIds };
    } else {
      return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 });
    }

    const courses = await db.course.findMany({
      where,
      include: {
        class: {
          include: {
            _count: {
              select: { enrollments: true },
            },
          },
        },
        teacher: {
          select: { id: true, fullName: true, role: true },
        },
        _count: {
          select: {
            lessons: true,
            grades: true,
            homework: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ courses });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const body = await request.json();
    const { schoolId, classId, teacherId, name, description, coefficient, maxScore, weeklyHours } = body;

    if (!schoolId || !classId || !teacherId || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: schoolId, classId, teacherId, name' },
        { status: 400 }
      );
    }

    // Admin uniquement, et admin de la même école
    if (auth.role !== 'ADMIN' || auth.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé. Action réservée aux administrateurs.' }, { status: 403 });
    }

    const [schoolClass, teacher] = await Promise.all([
      db.schoolClass.findFirst({ where: { id: classId, schoolId, deletedAt: null }, select: { id: true, name: true } }),
      db.user.findFirst({ where: { id: teacherId, schoolId, role: 'TEACHER', active: true, deletedAt: null }, select: { id: true } }),
    ]);
    if (!schoolClass) return NextResponse.json({ error: 'Classe introuvable dans votre école.' }, { status: 404 });
    if (!teacher) return NextResponse.json({ error: 'Le professeur doit être actif dans votre école.' }, { status: 400 });

    const course = await db.course.create({
      data: {
        schoolId,
        classId,
        teacherId,
        name,
        description: description || '',
        ...(coefficient !== undefined && coefficient > 0 ? { coefficient: Math.min(parseInt(String(coefficient), 10) || 1, 10) } : {}),
        ...(maxScore !== undefined && maxScore > 0 ? { maxScore: parseFloat(String(maxScore)) } : {}),
        ...(weeklyHours !== undefined ? { weeklyHours: parseFloat(String(weeklyHours)) || 0 } : {}),
      },
      include: {
        class: true,
        teacher: {
          select: { id: true, fullName: true, role: true },
        },
        _count: {
          select: {
            lessons: true,
            grades: true,
            homework: true,
          },
        },
      },
    });
    await auditFromRequest(request, {
      schoolId: auth.schoolId, userId: auth.userId, action: 'COURSE_ASSIGNED', entity: 'Course', entityId: course.id,
      after: { id: course.id, name: course.name, classId: course.classId, teacherId: course.teacherId },
    }).catch((error) => console.error('[Courses] Audit write failed:', error));

    const assignedAt = new Date().toLocaleString('fr-FR');
    await notifyUser({
      schoolId: auth.schoolId,
      senderId: auth.userId,
      userId: teacher.id,
      targetRole: 'TEACHER',
      title: 'Nouveau cours attribué',
      message: `${auth.name} vous a attribué le cours « ${course.name} » en classe de ${schoolClass.name}, le ${assignedAt}.`,
      type: 'LESSON',
      priority: 'NORMAL',
      metadata: { courseId: course.id, classId: schoolClass.id, teacherId: teacher.id, changedAt: new Date().toISOString() },
    }).catch((error) => console.error('[Courses] Assignment notification failed:', error));

    return NextResponse.json({ course }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const body = await request.json();
    const { id, name, description, teacherId, classId, status, maxScore, coefficient, weeklyHours } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
    }

    // Admin uniquement, et admin de la même école
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès non autorisé. Action réservée aux administrateurs.' }, { status: 403 });
    }
    const existing = await db.course.findUnique({
      where: { id },
      include: { teacher: { select: { id: true, fullName: true } }, class: { select: { id: true, name: true } } },
    });
    if (!existing || existing.schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Cours introuvable dans votre établissement.' }, { status: 403 });
    }
    if (classId !== undefined) {
      const schoolClass = await db.schoolClass.findFirst({ where: { id: classId, schoolId: auth.schoolId, deletedAt: null }, select: { id: true } });
      if (!schoolClass) return NextResponse.json({ error: 'Classe introuvable dans votre école.' }, { status: 404 });
    }
    if (teacherId !== undefined) {
      const teacher = await db.user.findFirst({ where: { id: teacherId, schoolId: auth.schoolId, role: 'TEACHER', active: true, deletedAt: null }, select: { id: true } });
      if (!teacher) return NextResponse.json({ error: 'Le professeur doit être actif dans votre école.' }, { status: 400 });
    }

    const course = await db.course.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(teacherId !== undefined && { teacherId }),
        ...(classId !== undefined && { classId }),
        ...(status !== undefined && { status }),
        ...(maxScore !== undefined && { maxScore: parseFloat(maxScore) }),
        ...(coefficient !== undefined && { coefficient: Math.min(parseInt(String(coefficient), 10) || 1, 10) }),
        ...(weeklyHours !== undefined && { weeklyHours: parseFloat(String(weeklyHours)) || 0 }),
      },
      include: {
        class: true,
        teacher: {
          select: { id: true, fullName: true, role: true },
        },
        _count: {
          select: {
            lessons: true,
            grades: true,
            homework: true,
          },
        },
      },
    });
    await auditFromRequest(request, {
      schoolId: auth.schoolId, userId: auth.userId, action: 'COURSE_UPDATED', entity: 'Course', entityId: course.id,
      before: { name: existing.name, classId: existing.classId, teacherId: existing.teacherId },
      after: { name: course.name, classId: course.classId, teacherId: course.teacherId },
    }).catch((error) => console.error('[Courses] Audit write failed:', error));

    if (existing.teacherId !== course.teacherId || existing.classId !== course.classId) {
      const changedAt = new Date();
      const when = changedAt.toLocaleString('fr-FR');
      const previousAssignment = `« ${existing.name} » en classe de ${existing.class.name}`;
      const nextAssignment = `« ${course.name} » en classe de ${course.class.name}`;
      if (existing.teacherId === course.teacherId) {
        await notifyUser({
          schoolId: auth.schoolId, senderId: auth.userId, userId: course.teacherId, targetRole: 'TEACHER',
          title: 'Attribution de cours modifiée',
          message: `${auth.name} a déplacé ${nextAssignment} depuis ${previousAssignment}, le ${when}.`,
          type: 'LESSON', priority: 'NORMAL',
          metadata: { courseId: course.id, oldClassId: existing.classId, classId: course.classId, changedAt: changedAt.toISOString() },
        }).catch((error) => console.error('[Courses] Assignment notification failed:', error));
      } else {
        await Promise.allSettled([
          notifyUser({
            schoolId: auth.schoolId, senderId: auth.userId, userId: existing.teacherId, targetRole: 'TEACHER',
            title: 'Cours retiré de votre attribution',
            message: `${auth.name} vous a retiré ${previousAssignment}, le ${when}.`,
            type: 'LESSON', priority: 'NORMAL',
            metadata: { courseId: course.id, classId: existing.classId, changedAt: changedAt.toISOString() },
          }),
          notifyUser({
            schoolId: auth.schoolId, senderId: auth.userId, userId: course.teacherId, targetRole: 'TEACHER',
            title: 'Nouveau cours attribué',
            message: `${auth.name} vous a attribué ${nextAssignment}, le ${when}.`,
            type: 'LESSON', priority: 'NORMAL',
            metadata: { courseId: course.id, classId: course.classId, teacherId: course.teacherId, changedAt: changedAt.toISOString() },
          }),
        ]).then((results) => results.filter((result) => result.status === 'rejected').forEach((result) => console.error('[Courses] Assignment notification failed:', result.reason)));
      }
    }

    return NextResponse.json({ course });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
