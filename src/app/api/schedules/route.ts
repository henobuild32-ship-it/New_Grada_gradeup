import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { authenticateRequest, authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { detectScheduleConflicts } from '@/lib/business/rules';
import { auditFromRequest } from '@/lib/api/audit';

// GET /api/schedules?schoolId=...&classId=...&dayOfWeek=...
export async function GET(request: NextRequest) {
  try {
    // La lecture reste limitée aux classes que l'utilisateur peut consulter.
    const auth = await authenticateRequestActive(request);
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || auth.schoolId;
    const classId = searchParams.get('classId');
    const dayOfWeek = searchParams.get('dayOfWeek');
    const courseId = searchParams.get('courseId');

    if (schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    let allowedClassIds: string[] | null = null;
    if (auth.role === 'TEACHER') {
      const courses = await db.course.findMany({
        where: { schoolId, teacherId: auth.userId, deletedAt: null },
        select: { classId: true },
      });
      allowedClassIds = [...new Set(courses.map((course) => course.classId))];
    } else if (auth.role === 'STUDENT') {
      const enrollments = await db.enrolledClass.findMany({
        where: { userId: auth.userId, class: { schoolId } },
        select: { classId: true },
      });
      allowedClassIds = [...new Set(enrollments.map((enrollment) => enrollment.classId))];
    } else if (auth.role === 'PARENT') {
      const children = await db.user.findMany({
        where: { parentId: auth.userId, schoolId, active: true, deletedAt: null },
        select: {
          classEnrollments: {
            where: { class: { schoolId } },
            select: { classId: true },
          },
        },
      });
      allowedClassIds = [...new Set(children.flatMap((child) => child.classEnrollments.map((enrollment) => enrollment.classId)))];
    } else if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    if (classId && allowedClassIds && !allowedClassIds.includes(classId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette classe' }, { status: 403 });
    }

    let parsedDay: number | undefined;
    if (dayOfWeek) {
      parsedDay = Number(dayOfWeek);
      if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 7) {
        return NextResponse.json({ error: 'dayOfWeek doit être un entier de 1 à 7' }, { status: 400 });
      }
    }

    const where: Prisma.CourseScheduleWhereInput = { schoolId, deletedAt: null };
    const courseWhere: Prisma.CourseWhereInput = {};
    if (parsedDay !== undefined) where.dayOfWeek = parsedDay;
    if (allowedClassIds) {
      if (allowedClassIds.length === 0) return NextResponse.json([]);
      courseWhere.classId = { in: classId ? [classId] : allowedClassIds };
    } else if (classId) {
      courseWhere.classId = classId;
    }
    if (courseId) courseWhere.id = courseId;
    if (Object.keys(courseWhere).length > 0) where.course = { is: courseWhere };

    const schedules = await db.courseSchedule.findMany({
      where,
      include: {
        course: {
          include: {
            teacher: { select: { id: true, fullName: true } },
            class: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return NextResponse.json(schedules);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[GET /api/schedules]', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/schedules
export async function POST(request: NextRequest) {
  try {
    // Écrire : admin uniquement
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Seul un administrateur peut créer un horaire.' }, { status: 403 });
    }

    const body = await request.json();
    const { courseId, schoolId, dayOfWeek, startTime, endTime, room, periodStart, periodEnd, exceptions, force } = body;

    if (!courseId || !schoolId || !dayOfWeek || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'courseId, schoolId, dayOfWeek, startTime et endTime sont requis' },
        { status: 400 }
      );
    }
    if (schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    // Check that course belongs to the school
    const course = await db.course.findFirst({
      where: { id: courseId, schoolId },
    });

    if (!course) {
      return NextResponse.json({ error: 'Cours introuvable' }, { status: 404 });
    }

    // Détection des conflits (prof, salle, classe)
    if (!force) {
      const conflicts = await detectScheduleConflicts(schoolId, {
        courseId,
        dayOfWeek: parseInt(String(dayOfWeek), 10),
        startTime,
        endTime,
        room: room || '',
      });
      if (conflicts.length > 0) {
        return NextResponse.json(
          {
            error: 'Conflit d’horaires détecté.',
            conflicts,
          },
          { status: 409 }
        );
      }
    }

    const schedule = await db.courseSchedule.create({
      data: {
        courseId,
        schoolId,
        dayOfWeek: parseInt(String(dayOfWeek)),
        startTime,
        endTime,
        room: room || '',
        periodStart: periodStart ? new Date(periodStart) : null,
        periodEnd: periodEnd ? new Date(periodEnd) : null,
        exceptions: exceptions || '[]',
      },
      include: {
        course: {
          include: {
            teacher: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'SCHEDULE_CREATE',
      entity: 'CourseSchedule',
      entityId: schedule.id,
      after: schedule,
    });

    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[POST /api/schedules]', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PUT /api/schedules
export async function PUT(request: NextRequest) {
  try {
    // Écrire : admin uniquement
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Seul un administrateur peut modifier un horaire.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, courseId, dayOfWeek, startTime, endTime, room, periodStart, periodEnd, exceptions, force } = body;

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 });
    }

    const existing = await db.courseSchedule.findUnique({ where: { id } });
    if (!existing || existing.schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    // Détection des conflits si modification d'horaire
    const targetCourseId = courseId || existing.courseId;
    const targetDay = dayOfWeek !== undefined ? parseInt(String(dayOfWeek), 10) : existing.dayOfWeek;
    const targetStart = startTime || existing.startTime;
    const targetEnd = endTime || existing.endTime;
    const targetRoom = room !== undefined ? room : existing.room;

    if (!force) {
      const conflicts = await detectScheduleConflicts(
        auth.schoolId,
        {
          courseId: targetCourseId,
          dayOfWeek: targetDay,
          startTime: targetStart,
          endTime: targetEnd,
          room: targetRoom,
        },
        id
      );
      if (conflicts.length > 0) {
        return NextResponse.json(
          {
            error: 'Conflit d’horaires détecté.',
            conflicts,
          },
          { status: 409 }
        );
      }
    }

    const updated = await db.courseSchedule.update({
      where: { id },
      data: {
        ...(courseId !== undefined && { courseId }),
        ...(dayOfWeek !== undefined && { dayOfWeek: parseInt(String(dayOfWeek)) }),
        ...(startTime !== undefined && { startTime }),
        ...(endTime !== undefined && { endTime }),
        ...(room !== undefined && { room: room || '' }),
        ...(periodStart !== undefined && { periodStart: periodStart ? new Date(periodStart) : null }),
        ...(periodEnd !== undefined && { periodEnd: periodEnd ? new Date(periodEnd) : null }),
        ...(exceptions !== undefined && { exceptions: exceptions || '[]' }),
      },
      include: {
        course: {
          include: {
            teacher: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'SCHEDULE_UPDATE',
      entity: 'CourseSchedule',
      entityId: updated.id,
      before: existing,
      after: updated,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[PUT /api/schedules]', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE /api/schedules?id=...
export async function DELETE(request: NextRequest) {
  try {
    // Admin uniquement
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Seul un administrateur peut supprimer un horaire.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 });
    }

    const existing = await db.courseSchedule.findUnique({ where: { id } });
    if (!existing || existing.schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const deleted = await db.courseSchedule.delete({ where: { id } });
    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'SCHEDULE_DELETE',
      entity: 'CourseSchedule',
      entityId: deleted.id,
      before: existing,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[DELETE /api/schedules]', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
