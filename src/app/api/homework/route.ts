import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive } from '@/lib/auth/authenticate';
import { assertSchool, assertTeacherCourse, scopedStudentIds } from '@/lib/api/rbac';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { notifyUser } from '@/services/notifications/notificationEngine';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId');
    const teacherId = searchParams.get('teacherId');
    const classId = searchParams.get('classId');

    const schoolId = auth.schoolId;
    const where: Record<string, unknown> = { schoolId };

    if (courseId) {
      where.courseId = courseId;
    }

    if (teacherId) {
      where.teacherId = teacherId;
    }

    // Filter by classId: find all courses in that class, then filter homework by those courses
    if (classId) {
      const classCoursesIds = await db.course.findMany({
        where: { classId, schoolId },
        select: { id: true },
      });
      where.courseId = { in: classCoursesIds.map((c) => c.id) };
    }

    // Élève / parent : uniquement les devoirs des cours publiés de leurs classes (ou de celles de leurs enfants)
    if (auth.role === 'STUDENT' || auth.role === 'PARENT') {
      const studentIds = await scopedStudentIds(auth);
      const enrollments = await db.enrolledClass.findMany({
        where: { userId: { in: studentIds ?? [] } },
        select: { classId: true },
      });
      const classIds = [...new Set(enrollments.map((e) => e.classId))];
      where.isPublished = true;
      where.course = { classId: { in: classIds }, isPublished: true };
    }

    const homework = await db.homework.findMany({
      where,
      include: {
        course: {
          select: { id: true, name: true, class: { select: { id: true, name: true } } },
        },
        teacher: {
          select: { id: true, fullName: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ homework });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}


export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN' && auth.role !== 'TEACHER') {
      throw new ApiError('Accès refusé : réservé aux enseignants et à l’administration.', 403, 'ROLE_FORBIDDEN');
    }

    const body = await request.json();
    const { courseId, teacherId: teacherIdBody, title, description, dueDate, gradingType, fileUrl, fileName } = body;
    const operationId = request.headers.get('x-idempotency-key') || body.operationId;

    const schoolId = auth.schoolId;
    if (!courseId || !title) {
      return NextResponse.json(
        { error: 'Missing required fields: courseId, teacherId, title' },
        { status: 400 }
      );
    }

    // Le cours doit appartenir à l'école de la session
    const course = await db.course.findUnique({
      where: { id: courseId },
      select: { schoolId: true },
    });
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }
    assertSchool(auth, course.schoolId);

    // Un enseignant ne crée des devoirs que sur son propre cours (ADMIN : n'importe quel cours de l'école)
    await assertTeacherCourse(auth, courseId);

    // teacherId toujours aligné : soi-même (enseignant) ou explicitement fourni par l'admin
    const teacherId = auth.role === 'TEACHER' ? auth.userId : teacherIdBody;
    if (!teacherId) {
      return NextResponse.json(
        { error: 'Missing required fields: courseId, teacherId, title' },
        { status: 400 }
      );
    }

    if (operationId) {
      const previous = await db.syncOperation.findUnique({ where: { operationId } });
      if (previous) {
        if (previous.userId !== auth.userId || previous.schoolId !== schoolId) {
          return NextResponse.json({ error: 'Clé de synchronisation invalide' }, { status: 403 });
        }
        return NextResponse.json(previous.response, { status: previous.statusCode });
      }
    }

    const homework = await db.homework.create({
      data: {
        schoolId,
        courseId,
        teacherId,
        title,
        description: description || '',
        dueDate: dueDate || '',
        gradingType: gradingType || 'manual',
        fileUrl: fileUrl || '',
        fileName: fileName || '',
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

    const courseObj = await db.course.findUnique({
      where: { id: courseId },
      select: { classId: true, name: true },
    });

    if (courseObj?.classId) {
      notifyUser({
        schoolId,
        targetRole: 'STUDENT',
        targetClassId: courseObj.classId,
        senderId: teacherId,
        title: `📝 Nouveau devoir : ${title}`,
        message: `Devoir en ${courseObj.name}${dueDate ? ' à rendre pour le ' + dueDate : ''}.`,
        type: 'HOMEWORK',
        priority: 'HIGH',
        metadata: { homeworkId: homework.id, courseId },
      }).catch((err) => console.error('[Homework] Notification trigger error:', err));
    }

    const responseBody = { homework };
    if (operationId) {
      await db.syncOperation.create({
        data: {
          operationId,
          userId: auth.userId,
          schoolId,
          operationType: 'CREATE_HOMEWORK',
          statusCode: 201,
          response: responseBody,
        },
      });
    }
    return NextResponse.json(responseBody, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
