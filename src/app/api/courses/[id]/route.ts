import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, type AuthUser } from '@/lib/auth/authenticate';
import { assertSchool } from '@/lib/api/rbac';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { notifyUser } from '@/services/notifications/notificationEngine';
import { auditFromRequest } from '@/lib/api/audit';

/** Lecture d'un cours : admin ; prof du cours ou titulaire de la classe ;
 * étudiant inscrit à la classe ; parent d'un élève inscrit. */
async function assertCourseReadable(auth: AuthUser, course: { classId: string; teacherId: string }): Promise<void> {
  if (auth.role === 'ADMIN' || auth.role === 'LECTEUR') return;

  if (auth.role === 'TEACHER') {
    if (course.teacherId === auth.userId) return;
    const titular = await db.schoolClass.findFirst({
      where: { id: course.classId, titulaireId: auth.userId },
      select: { id: true },
    });
    if (titular) return;
    throw new ApiError('Accès refusé : ce cours n’est pas le vôtre.', 403, 'OWNERSHIP_FORBIDDEN');
  }

  if (auth.role === 'STUDENT') {
    const enrollment = await db.enrolledClass.findFirst({
      where: { userId: auth.userId, classId: course.classId },
      select: { id: true },
    });
    if (enrollment) return;
    throw new ApiError('Accès refusé : vous n’êtes pas inscrit à cette classe.', 403, 'OWNERSHIP_FORBIDDEN');
  }

  // PARENT
  const childEnrollment = await db.enrolledClass.findFirst({
    where: { classId: course.classId, user: { parentId: auth.userId } },
    select: { id: true },
  });
  if (childEnrollment) return;
  throw new ApiError('Accès refusé : ce cours n’est pas celui de vos enfants.', 403, 'OWNERSHIP_FORBIDDEN');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    const { id } = await params;

    const course = await db.course.findUnique({
      where: { id },
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
    });

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    assertSchool(auth, course.schoolId);
    await assertCourseReadable(auth, course);

    return NextResponse.json({ course });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    const { id } = await params;
    const body = await request.json();
    const { name, description, teacherId, classId, coefficient, weeklyHours } = body;

    const existing = await db.course.findUnique({
      where: { id },
      include: { teacher: { select: { id: true } }, class: { select: { id: true, name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    assertSchool(auth, existing.schoolId);

    // L’affectation du cours reste administrée par l’école.
    if (auth.role !== 'ADMIN' && existing.teacherId !== auth.userId) {
      throw new ApiError('Accès refusé : réservé au professeur du cours ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
    }
    if (auth.role !== 'ADMIN' && (teacherId !== undefined || classId !== undefined)) {
      throw new ApiError('Seule l’administration peut affecter un cours à un professeur ou à une classe.', 403, 'ROLE_FORBIDDEN');
    }
    if ((classId !== undefined && typeof classId !== 'string') || (teacherId !== undefined && typeof teacherId !== 'string')) {
      return NextResponse.json({ error: 'Classe ou professeur invalide.' }, { status: 400 });
    }
    if (auth.role === 'ADMIN' && classId !== undefined) {
      const schoolClass = await db.schoolClass.findFirst({ where: { id: classId, schoolId: auth.schoolId, deletedAt: null }, select: { id: true } });
      if (!schoolClass) return NextResponse.json({ error: 'Classe introuvable dans votre école.' }, { status: 404 });
    }
    if (auth.role === 'ADMIN' && teacherId !== undefined) {
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
      const oldClass = existing.class.name;
      const newClass = course.class.name;
      const previousAssignment = `« ${existing.name} » en classe de ${oldClass}`;
      const nextAssignment = `« ${course.name} » en classe de ${newClass}`;
      const results = existing.teacherId === course.teacherId
        ? await Promise.allSettled([notifyUser({
          schoolId: auth.schoolId, senderId: auth.userId, userId: course.teacherId, targetRole: 'TEACHER',
          title: 'Attribution de cours modifiée', message: `${auth.name} a déplacé ${nextAssignment} depuis ${previousAssignment}, le ${when}.`,
          type: 'LESSON', priority: 'NORMAL', metadata: { courseId: course.id, classId: course.classId, changedAt: changedAt.toISOString() },
        })])
        : await Promise.allSettled([
          notifyUser({ schoolId: auth.schoolId, senderId: auth.userId, userId: existing.teacherId, targetRole: 'TEACHER', title: 'Cours retiré de votre attribution', message: `${auth.name} vous a retiré ${previousAssignment}, le ${when}.`, type: 'LESSON', priority: 'NORMAL', metadata: { courseId: course.id, classId: existing.classId, changedAt: changedAt.toISOString() } }),
          notifyUser({ schoolId: auth.schoolId, senderId: auth.userId, userId: course.teacherId, targetRole: 'TEACHER', title: 'Nouveau cours attribué', message: `${auth.name} vous a attribué ${nextAssignment}, le ${when}.`, type: 'LESSON', priority: 'NORMAL', metadata: { courseId: course.id, classId: course.classId, changedAt: changedAt.toISOString() } }),
        ]);
      results.filter((result) => result.status === 'rejected').forEach((result) => console.error('[Courses] Assignment notification failed:', result.reason));
    }

    return NextResponse.json({ course });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    const { id } = await params;

    const existing = await db.course.findUnique({
      where: { id },
      include: { teacher: { select: { id: true } }, class: { select: { id: true, name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    assertSchool(auth, existing.schoolId);

    if (auth.role !== 'ADMIN') throw new ApiError('La suppression d’un cours est réservée à l’administration.', 403, 'ROLE_FORBIDDEN');

    await db.course.delete({ where: { id } });
    const changedAt = new Date();
    await Promise.allSettled([
      notifyUser({
        schoolId: auth.schoolId, senderId: auth.userId, userId: existing.teacherId, targetRole: 'TEACHER',
        title: 'Cours retiré de votre attribution',
        message: `${auth.name} a supprimé le cours « ${existing.name} » de la classe « ${existing.class.name} », le ${changedAt.toLocaleString('fr-FR')}.`,
        type: 'LESSON', priority: 'NORMAL', metadata: { courseId: existing.id, classId: existing.classId, changedAt: changedAt.toISOString() },
      }),
      auditFromRequest(request, {
        schoolId: auth.schoolId, userId: auth.userId, action: 'COURSE_DELETED', entity: 'Course', entityId: existing.id,
        before: { name: existing.name, classId: existing.classId, teacherId: existing.teacherId },
      }),
    ]).then((results) => results.filter((result) => result.status === 'rejected').forEach((result) => console.error('[Courses] Delete follow-up failed:', result.reason)));

    return NextResponse.json({ message: 'Course deleted successfully' });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
