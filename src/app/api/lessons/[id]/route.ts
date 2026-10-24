import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, type AuthUser } from '@/lib/auth/authenticate';
import { assertSchool } from '@/lib/api/rbac';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { notifyUser } from '@/services/notifications/notificationEngine';
import { auditFromRequest } from '@/lib/api/audit';

type LessonCourseRef = { classId: string; teacherId: string; isPublished: boolean };

async function getLessonCourse(lesson: { courseId: string }): Promise<LessonCourseRef | null> {
  return db.course.findUnique({
    where: { id: lesson.courseId },
    select: { classId: true, teacherId: true, isPublished: true },
  });
}

/** Élève/parent : seulement si le cours est publié ET l'élève (ou son enfant) inscrit à la classe. */
async function assertLessonReadableForStudent(
  auth: AuthUser,
  course: LessonCourseRef,
  lessonIsPublished: boolean
): Promise<void> {
  if (!lessonIsPublished || !course.isPublished) {
    throw new ApiError('Accès refusé : cette leçon n’est pas publiée.', 403, 'FORBIDDEN');
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
  throw new ApiError('Accès refusé : cette leçon n’est pas celle de vos enfants.', 403, 'OWNERSHIP_FORBIDDEN');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    const { id } = await params;

    const lesson = await db.lesson.findUnique({
      where: { id },
      include: {
        course: {
          select: { id: true, name: true, classId: true, isPublished: true },
        },
        teacher: {
          select: { id: true, fullName: true, role: true },
        },
      },
    });

    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    assertSchool(auth, lesson.schoolId);

    if (auth.role === 'ADMIN') {
      // autorisé
    } else if (auth.role === 'TEACHER') {
      const course = await getLessonCourse(lesson);
      const isOwner = lesson.teacherId === auth.userId || course?.teacherId === auth.userId;
      if (!isOwner) {
        const titular = course
          ? await db.schoolClass.findFirst({
              where: { id: course.classId, titulaireId: auth.userId },
              select: { id: true },
            })
          : null;
        if (!titular) {
          throw new ApiError('Accès refusé : cette leçon ne vous est pas liée.', 403, 'OWNERSHIP_FORBIDDEN');
        }
      }
    } else {
      const course = await getLessonCourse(lesson);
      if (!course) {
        throw new ApiError('Accès refusé : cours introuvable.', 403, 'FORBIDDEN');
      }
      await assertLessonReadableForStudent(auth, course, lesson.isPublished);
    }

    return NextResponse.json({ lesson });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    const { id } = await params;
    const body = await request.json();
    const { title, content, fileUrl, fileName } = body;
    const isPublished = body.isPublished;
    if (isPublished !== undefined && typeof isPublished !== 'boolean') {
      return NextResponse.json({ error: 'isPublished doit être un booléen.' }, { status: 400 });
    }

    const existing = await db.lesson.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    assertSchool(auth, existing.schoolId);

    // ADMIN ou professeur propriétaire (leçon ou cours)
    if (auth.role !== 'ADMIN') {
      const course = await getLessonCourse(existing);
      if (existing.teacherId !== auth.userId && course?.teacherId !== auth.userId) {
        throw new ApiError('Accès refusé : réservé au professeur de la leçon ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
      }
    }

    const lesson = await db.lesson.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(fileUrl !== undefined && { fileUrl }),
        ...(fileName !== undefined && { fileName }),
        ...(isPublished !== undefined && {
          isPublished,
          publishedAt: isPublished ? existing.publishedAt ?? new Date() : null,
        }),
      },
      include: {
        course: {
          select: { id: true, name: true, classId: true, isPublished: true },
        },
        teacher: {
          select: { id: true, fullName: true, role: true },
        },
      },
    });

    if (!existing.isPublished && lesson.isPublished && lesson.course?.isPublished && lesson.course?.classId) {
      notifyUser({
        schoolId: lesson.schoolId,
        targetRole: 'STUDENT',
        targetClassId: lesson.course.classId,
        senderId: lesson.teacherId,
        title: `📚 Nouveau cours : ${lesson.title}`,
        message: `Votre professeur a publié la leçon « ${lesson.title} » pour le cours de ${lesson.course.name}.`,
        type: 'LESSON',
        priority: 'NORMAL',
        metadata: { lessonId: lesson.id, courseId: lesson.courseId },
      }).catch((err) => console.error('[Lessons] Notification trigger error:', err));
    }

    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: isPublished !== undefined && existing.isPublished !== isPublished ? (isPublished ? 'LESSON_PUBLISH' : 'LESSON_UNPUBLISH') : 'LESSON_UPDATE',
      entity: 'Lesson',
      entityId: lesson.id,
      before: { id: existing.id, title: existing.title, isPublished: existing.isPublished },
      after: { id: lesson.id, title: lesson.title, isPublished: lesson.isPublished },
    });

    return NextResponse.json({ lesson });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    const { id } = await params;

    const existing = await db.lesson.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    assertSchool(auth, existing.schoolId);

    // ADMIN ou professeur propriétaire (leçon ou cours)
    if (auth.role !== 'ADMIN') {
      const course = await getLessonCourse(existing);
      if (existing.teacherId !== auth.userId && course?.teacherId !== auth.userId) {
        throw new ApiError('Accès refusé : réservé au professeur de la leçon ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
      }
    }

    await db.lesson.delete({ where: { id } });
    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'LESSON_DELETE',
      entity: 'Lesson',
      entityId: id,
      before: { id: existing.id, title: existing.title, courseId: existing.courseId },
    });

    return NextResponse.json({ message: 'Lesson deleted successfully' });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
