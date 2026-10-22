import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError, ApiError } from '@/lib/api/errors';

// POST /api/schedules/duplicate
export async function POST(request: NextRequest) {
  try {
    // Réservé à l'admin ; schoolId forcé par la session (ignoré dans le body/query).
    const auth = await requireAuth(request, ['ADMIN']);
    const body = await request.json();
    const { sourceClassId, targetClassId } = body;
    const schoolId = auth.schoolId;

    if (!sourceClassId || !targetClassId) {
      return NextResponse.json(
        { error: 'sourceClassId et targetClassId requis' },
        { status: 400 }
      );
    }

    if (sourceClassId === targetClassId) {
      return NextResponse.json(
        { error: 'La classe source et cible doivent être différentes' },
        { status: 400 }
      );
    }

    // Multi-tenant : les deux classes doivent appartenir à l'école de la session.
    const classes = await db.schoolClass.findMany({
      where: { id: { in: [sourceClassId, targetClassId] }, schoolId },
      select: { id: true },
    });
    if (classes.length !== 2) {
      throw new ApiError('Classe source ou cible introuvable dans votre établissement.', 404);
    }

    // Load source schedules
    const sourceSchedules = await db.courseSchedule.findMany({
      where: {
        schoolId,
        course: { classId: sourceClassId },
      },
      include: {
        course: true,
      },
    });

    if (sourceSchedules.length === 0) {
      return NextResponse.json(
        { error: 'Aucun horaire trouvé dans la classe source' },
        { status: 404 }
      );
    }

    // Load or list target courses to map by name
    const targetCourses = await db.course.findMany({
      where: { schoolId, classId: targetClassId },
    });

    const targetCoursesByName = new Map(
      targetCourses.map((c) => [c.name.toLowerCase().trim(), c])
    );

    const createdSchedules: any[] = [];

    // Duplicate logic in a transaction
    await db.$transaction(async (tx) => {
      for (const sched of sourceSchedules) {
        const courseNameKey = sched.course.name.toLowerCase().trim();
        let targetCourse = targetCoursesByName.get(courseNameKey);

        // If target course doesn't exist, create it dynamically copying teacher assignment
        if (!targetCourse) {
          targetCourse = await tx.course.create({
            data: {
              schoolId,
              classId: targetClassId,
              teacherId: sched.course.teacherId,
              name: sched.course.name,
              maxScore: sched.course.maxScore,
              coefficient: sched.course.coefficient,
              description: sched.course.description,
              status: sched.course.status,
            },
          });
          targetCoursesByName.set(courseNameKey, targetCourse);
        }

        // Create the duplicate schedule slot
        const newSched = await tx.courseSchedule.create({
          data: {
            schoolId,
            courseId: targetCourse.id,
            dayOfWeek: sched.dayOfWeek,
            startTime: sched.startTime,
            endTime: sched.endTime,
            room: sched.room,
            periodStart: sched.periodStart,
            periodEnd: sched.periodEnd,
            exceptions: sched.exceptions,
          },
        });
        createdSchedules.push(newSched);
      }
    });

    return NextResponse.json({
      success: true,
      message: `${createdSchedules.length} créneaux horaires dupliqués avec succès`,
      count: createdSchedules.length,
    });
  } catch (error) {
    console.error('[POST /api/schedules/duplicate]', error);
    return handleApiError(error);
  }
}
