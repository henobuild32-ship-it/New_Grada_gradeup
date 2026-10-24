import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { requireAuth } from '@/lib/api/rbac';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { notifyUser } from '@/services/notifications/notificationEngine';
import { auditFromRequest } from '@/lib/api/audit';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const courseId = searchParams.get('courseId');
    const teacherId = searchParams.get('teacherId');

    if (!schoolId || schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'schoolId invalide' }, { status: 400 });
    }

    const where: Record<string, unknown> = { schoolId, deletedAt: null };

    if (courseId) {
      where.courseId = courseId;
    }

    if (auth.role === 'TEACHER') {
      if (teacherId && teacherId !== auth.userId) {
        return NextResponse.json({ error: 'Accès limité à vos cours.' }, { status: 403 });
      }
      where.teacherId = auth.userId;
      if (courseId) {
        const course = await db.course.findFirst({
          where: { id: courseId, schoolId, teacherId: auth.userId, deletedAt: null },
          select: { id: true },
        });
        if (!course) return NextResponse.json({ error: 'Vous ne pouvez consulter que vos cours.' }, { status: 403 });
      }
    } else if (auth.role === 'ADMIN') {
      if (teacherId) where.teacherId = teacherId;
    }

    // STUDENT can only see lessons for courses they are enrolled in
    if (auth.role === 'STUDENT' || auth.role === 'PARENT') {
      // Les élèves et leurs parents ne doivent jamais recevoir de leçons en brouillon.
      where.isPublished = true;
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
      const accessibleCourses = await db.course.findMany({
        where: { classId: { in: classIds }, schoolId, deletedAt: null, isPublished: true },
        select: { id: true },
      });
      const accessibleCourseIds = accessibleCourses.map(c => c.id);
      if (courseId && !accessibleCourseIds.includes(courseId)) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
      if (!courseId) {
        where.courseId = { in: accessibleCourseIds };
      }
    } else if (auth.role !== 'TEACHER' && auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const lessons = await db.lesson.findMany({
      where,
      include: {
        course: {
          select: { id: true, name: true, classId: true },
        },
        teacher: {
          select: { id: true, fullName: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ lessons });
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
    // Réservé aux professeurs et administrateurs (les élèves/parents ne publient pas de cours).
    const auth = await requireAuth(request, ['TEACHER', 'ADMIN']);
    const body = await request.json();
    const { courseId, title, content, fileUrl, fileName, teacherId } = body;
    const isPublished = body.isPublished === true;

    if (!courseId || !title) {
      return NextResponse.json(
        { error: 'Champs requis : courseId, title' },
        { status: 400 }
      );
    }

    // Le cours doit appartenir à l'école de la session.
    const course = await db.course.findFirst({
      where: { id: courseId, schoolId: auth.schoolId, deletedAt: null },
      select: { id: true, teacherId: true, classId: true, name: true },
    });
    if (!course) {
      return NextResponse.json({ error: 'Cours introuvable dans votre établissement.' }, { status: 404 });
    }
    // Un professeur ne publie que sur ses propres cours.
    if (auth.role === 'TEACHER' && course.teacherId !== auth.userId) {
      return NextResponse.json(
        { error: 'Accès refusé : vous n’enseignez pas ce cours.' },
        { status: 403 }
      );
    }

    const schoolId = auth.schoolId;
    const effectiveTeacherId = auth.role === 'TEACHER' ? auth.userId : (teacherId || course.teacherId);
    if (auth.role === 'ADMIN') {
      const teacher = await db.user.findFirst({
        where: { id: effectiveTeacherId, schoolId, role: 'TEACHER', active: true, deletedAt: null },
        select: { id: true },
      });
      if (!teacher) return NextResponse.json({ error: 'Professeur introuvable dans votre établissement.' }, { status: 400 });
    }

    const lesson = await db.lesson.create({
      data: {
        schoolId,
        courseId,
        teacherId: effectiveTeacherId,
        title,
        content: content || '',
        fileUrl: fileUrl || '',
        fileName: fileName || '',
        isPublished,
        publishedAt: isPublished ? new Date() : null,
      },
      include: {
        course: {
          select: { id: true, name: true, classId: true },
        },
        teacher: {
          select: { id: true, fullName: true, role: true },
        },
      },
    });

    if (isPublished && lesson.course?.classId) {
      notifyUser({
        schoolId,
        targetRole: 'STUDENT',
        targetClassId: lesson.course.classId,
        senderId: lesson.teacherId,
        title: `📚 Nouveau cours : ${title}`,
        message: `${lesson.teacher?.fullName || 'Votre professeur'} a publié la leçon "${title}" pour le cours de ${lesson.course.name}.`,
        type: 'LESSON',
        priority: 'NORMAL',
        metadata: { lessonId: lesson.id, courseId },
      }).catch((err) => console.error('[Lessons] Notification trigger error:', err));
    }

    await auditFromRequest(request, {
      schoolId,
      userId: auth.userId,
      action: isPublished ? 'LESSON_PUBLISH' : 'LESSON_DRAFT_CREATE',
      entity: 'Lesson',
      entityId: lesson.id,
      after: { id: lesson.id, courseId, teacherId: lesson.teacherId, title: lesson.title, isPublished: lesson.isPublished },
    });

    return NextResponse.json({ lesson }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ApiError) {
      return handleApiError(error);
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
