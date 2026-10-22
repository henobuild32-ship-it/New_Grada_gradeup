import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, type AuthUser } from '@/lib/auth/authenticate';
import { assertSchool, assertStudentScope } from '@/lib/api/rbac';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { assertYearOpen } from '@/lib/year-status';

/** Un enseignant ne peut gérer cette présence que si :
 * - c'est lui qui l'a enregistrée (teacherId), ou
 * - il est titulaire de la classe du cours concerné. */
async function canManageAttendance(
  auth: AuthUser,
  attendance: { teacherId: string; courseId: string }
): Promise<boolean> {
  if (auth.role !== 'TEACHER') return false;
  if (attendance.teacherId === auth.userId) return true;
  if (!attendance.courseId) return false;
  const course = await db.course.findUnique({
    where: { id: attendance.courseId },
    select: { classId: true },
  });
  if (!course) return false;
  const titular = await db.schoolClass.findFirst({
    where: { id: course.classId, titulaireId: auth.userId },
    select: { id: true },
  });
  return Boolean(titular);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    const { id } = await params;

    const attendance = await db.attendance.findUnique({
      where: { id },
      include: {
        student: {
          select: { id: true, fullName: true, role: true },
        },
      },
    });

    if (!attendance) {
      return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 });
    }

    assertSchool(auth, attendance.schoolId);

    if (auth.role === 'ADMIN') {
      // autorisé
    } else if (auth.role === 'TEACHER') {
      if (!(await canManageAttendance(auth, attendance))) {
        throw new ApiError('Accès refusé : cette présence ne vous est pas liée.', 403, 'OWNERSHIP_FORBIDDEN');
      }
    } else {
      // STUDENT / PARENT : uniquement leurs propres données
      await assertStudentScope(auth, attendance.studentId);
    }

    return NextResponse.json({ attendance });
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
    const { status, reason, date, courseId } = body;

    const existing = await db.attendance.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 });
    }

    assertSchool(auth, existing.schoolId);

    if (auth.role !== 'ADMIN' && !(await canManageAttendance(auth, existing))) {
      throw new ApiError('Accès refusé : réservé aux enseignants concernés ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
    }

    try {
      await assertYearOpen(existing.schoolId);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }

    if (date && date !== existing.date) {
      const newCourseId = courseId || existing.courseId;
      const conflicting = await db.attendance.findUnique({
        where: {
          studentId_date_courseId: {
            studentId: existing.studentId,
            date,
            courseId: newCourseId,
          },
        },
      });

      if (conflicting && conflicting.id !== id) {
        return NextResponse.json(
          { error: 'Attendance already recorded for this student on the new date' },
          { status: 409 }
        );
      }
    }

    const attendance = await db.attendance.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(reason !== undefined && { reason }),
        ...(date !== undefined && { date }),
        ...(courseId !== undefined && { courseId }),
      },
      include: {
        student: {
          select: { id: true, fullName: true, role: true },
        },
      },
    });

    return NextResponse.json({ attendance });
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

    const existing = await db.attendance.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Attendance record not found' }, { status: 404 });
    }

    assertSchool(auth, existing.schoolId);

    // ADMIN ou professeur propriétaire de la présence
    if (auth.role !== 'ADMIN' && existing.teacherId !== auth.userId) {
      throw new ApiError('Accès refusé : réservé au professeur propriétaire ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
    }

    await db.attendance.delete({ where: { id } });

    return NextResponse.json({ message: 'Attendance record deleted successfully' });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
