import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, type AuthUser } from '@/lib/auth/authenticate';
import { assertSchool } from '@/lib/api/rbac';
import { ApiError, handleApiError } from '@/lib/api/errors';

/** Lecture d'un cours : admin ; prof du cours ou titulaire de la classe ;
 * étudiant inscrit à la classe ; parent d'un élève inscrit. */
async function assertCourseReadable(auth: AuthUser, course: { classId: string; teacherId: string }): Promise<void> {
  if (auth.role === 'ADMIN') return;

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
    const auth = authenticateRequest(request);
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
    const auth = authenticateRequest(request);
    const { id } = await params;
    const body = await request.json();
    const { name, description, teacherId, classId, coefficient, weeklyHours } = body;

    const existing = await db.course.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    assertSchool(auth, existing.schoolId);

    // ADMIN ou professeur propriétaire du cours
    if (auth.role !== 'ADMIN' && existing.teacherId !== auth.userId) {
      throw new ApiError('Accès refusé : réservé au professeur du cours ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
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
    const auth = authenticateRequest(request);
    const { id } = await params;

    const existing = await db.course.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    assertSchool(auth, existing.schoolId);

    // ADMIN ou professeur propriétaire du cours
    if (auth.role !== 'ADMIN' && existing.teacherId !== auth.userId) {
      throw new ApiError('Accès refusé : réservé au professeur du cours ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
    }

    await db.course.delete({ where: { id } });

    return NextResponse.json({ message: 'Course deleted successfully' });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
