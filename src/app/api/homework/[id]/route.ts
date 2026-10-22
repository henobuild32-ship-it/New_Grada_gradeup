import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, type AuthUser } from '@/lib/auth/authenticate';
import { assertSchool, assertTeacherCourse } from '@/lib/api/rbac';
import { ApiError, handleApiError } from '@/lib/api/errors';

type HomeworkCourseRef = { classId: string; teacherId: string; isPublished: boolean };

async function getHomeworkCourse(homework: { courseId: string }): Promise<HomeworkCourseRef | null> {
  return db.course.findUnique({
    where: { id: homework.courseId },
    select: { classId: true, teacherId: true, isPublished: true },
  });
}

/** Droits de lecture (identiques à la liste des devoirs) :
 * ADMIN ; prof du cours / titulaire ; élève inscrit à la classe (devoir + cours publiés) ; parent d'un inscrit. */
async function assertHomeworkReadable(
  auth: AuthUser,
  homework: { teacherId: string; isPublished: boolean },
  course: HomeworkCourseRef | null
): Promise<void> {
  if (auth.role === 'ADMIN') return;

  if (auth.role === 'TEACHER') {
    if (course?.teacherId === auth.userId || homework.teacherId === auth.userId) return;
    if (course) {
      const titular = await db.schoolClass.findFirst({
        where: { id: course.classId, titulaireId: auth.userId },
        select: { id: true },
      });
      if (titular) return;
    }
    throw new ApiError('Accès refusé : ce devoir ne vous est pas lié.', 403, 'OWNERSHIP_FORBIDDEN');
  }

  if (!course || !course.isPublished || !homework.isPublished) {
    throw new ApiError('Accès refusé : ce devoir n’est pas publié.', 403, 'FORBIDDEN');
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
  throw new ApiError('Accès refusé : ce devoir n’est pas celui de vos enfants.', 403, 'OWNERSHIP_FORBIDDEN');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    const { id } = await params;

    const homework = await db.homework.findUnique({
      where: { id },
      include: {
        course: {
          select: { id: true, name: true },
        },
        teacher: {
          select: { id: true, fullName: true, role: true },
        },
      },
    });

    if (!homework) {
      return NextResponse.json({ error: 'Homework not found' }, { status: 404 });
    }

    assertSchool(auth, homework.schoolId);

    const course = await getHomeworkCourse(homework);
    await assertHomeworkReadable(auth, homework, course);

    return NextResponse.json({ homework });
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
    const { title, description, dueDate, gradingType, courseId, fileUrl, fileName } = body;

    const existing = await db.homework.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Homework not found' }, { status: 404 });
    }

    assertSchool(auth, existing.schoolId);

    // ADMIN ou professeur propriétaire du cours du devoir
    if (auth.role !== 'ADMIN') {
      if (auth.role !== 'TEACHER') {
        throw new ApiError('Accès refusé : réservé aux enseignants ou à l’administration.', 403, 'ROLE_FORBIDDEN');
      }
      await assertTeacherCourse(auth, existing.courseId);
    }

    // Si le devoir change de cours, le nouveau cours doit être dans la même école
    if (courseId !== undefined && courseId !== existing.courseId) {
      const newCourse = await db.course.findUnique({
        where: { id: courseId },
        select: { schoolId: true },
      });
      if (!newCourse) {
        return NextResponse.json({ error: 'Course not found' }, { status: 404 });
      }
      assertSchool(auth, newCourse.schoolId);
    }

    const homework = await db.homework.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(dueDate !== undefined && { dueDate }),
        ...(gradingType !== undefined && { gradingType }),
        ...(courseId !== undefined && { courseId }),
        ...(fileUrl !== undefined && { fileUrl }),
        ...(fileName !== undefined && { fileName }),
      },
      include: {
        course: {
          select: { id: true, name: true },
        },
        teacher: {
          select: { id: true, fullName: true, role: true },
        },
      },
    });

    return NextResponse.json({ homework });
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

    const existing = await db.homework.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Homework not found' }, { status: 404 });
    }

    assertSchool(auth, existing.schoolId);

    // ADMIN ou professeur propriétaire du cours du devoir
    if (auth.role !== 'ADMIN') {
      if (auth.role !== 'TEACHER') {
        throw new ApiError('Accès refusé : réservé aux enseignants ou à l’administration.', 403, 'ROLE_FORBIDDEN');
      }
      await assertTeacherCourse(auth, existing.courseId);
    }

    await db.homework.delete({ where: { id } });

    return NextResponse.json({ message: 'Homework deleted successfully' });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
