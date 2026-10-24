import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth/authenticate';
import { assertSchool, assertTeacherCourse, childrenIds } from '@/lib/api/rbac';
import { ApiError, handleApiError } from '@/lib/api/errors';

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    const { searchParams } = new URL(request.url);
    const homeworkId = searchParams.get('homeworkId');

    if (!homeworkId) {
      return NextResponse.json({ error: 'homeworkId et schoolId requis' }, { status: 400 });
    }

    const where: Record<string, unknown> = { homeworkId, schoolId: auth.schoolId };

    if (auth.role === 'STUDENT') {
      // Un élève ne voit que sa propre soumission
      where.studentId = auth.userId;
    } else if (auth.role === 'PARENT') {
      // Un parent ne voit que les soumissions de ses enfants
      where.studentId = { in: await childrenIds(auth.userId) };
    } else if (auth.role === 'TEACHER') {
      // Un enseignant ne voit que les soumissions des devoirs de ses cours
      where.homework = { course: { teacherId: auth.userId } };
    }
    // ADMIN : toutes les soumissions de l'école

    const submissions = await db.submission.findMany({
      where,
      include: {
        student: { select: { id: true, fullName: true, photoUrl: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return NextResponse.json({ submissions });
  } catch (err: unknown) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    const body = await request.json();
    const { homeworkId, studentId: studentIdBody, fileUrl, fileName, content } = body;

    if (!homeworkId || !studentIdBody) {
      return NextResponse.json({ error: 'Champs requis manquants: homeworkId, schoolId, studentId' }, { status: 400 });
    }

    const schoolId = auth.schoolId;

    const homework = await db.homework.findUnique({
      where: { id: homeworkId },
      include: {
        teacher: { select: { id: true } },
        course: { select: { id: true, classId: true } },
      },
    });

    if (!homework) {
      return NextResponse.json({ error: 'Devoir introuvable' }, { status: 404 });
    }
    assertSchool(auth, homework.schoolId);

    // studentId : un élève soumet toujours en son nom ; parent/prof/coordonné de façon cohérente
    let studentId = studentIdBody;
    if (auth.role === 'STUDENT') {
      studentId = auth.userId;
    } else if (auth.role === 'PARENT') {
      const child = await db.user.findFirst({
        where: { id: studentIdBody, parentId: auth.userId, deletedAt: null },
        select: { id: true, schoolId: true },
      });
      if (!child) {
        throw new ApiError('Accès refusé : ce compte n’est pas votre enfant.', 403, 'OWNERSHIP_FORBIDDEN');
      }
    } else if (auth.role === 'TEACHER') {
      // Seul le professeur du cours peut soumettre au nom d'un élève
      await assertTeacherCourse(auth, homework.courseId);
    }
    // ADMIN : aucun contrôle supplémentaire

    // L'élève destinataire doit appartenir à la même école
    const targetStudent = await db.user.findUnique({
      where: { id: studentId },
      select: { schoolId: true },
    });
    if (!targetStudent || targetStudent.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Devoir introuvable' }, { status: 404 });
    }

    const previousSubmission = await db.submission.findUnique({
      where: { homeworkId_studentId: { homeworkId, studentId } },
      select: { id: true, fileUrl: true, fileName: true, content: true, status: true },
    });
    const shouldNotifyTeacher = !previousSubmission
      || previousSubmission.status !== 'submitted'
      || previousSubmission.fileUrl !== (fileUrl || '')
      || previousSubmission.fileName !== (fileName || '')
      || previousSubmission.content !== (content || '');

    const submission = await db.submission.upsert({
      where: {
        homeworkId_studentId: { homeworkId, studentId },
      },
      update: {
        fileUrl: fileUrl || '',
        fileName: fileName || '',
        content: content || '',
        submittedAt: new Date(),
        status: 'submitted',
      },
      create: {
        homeworkId,
        studentId,
        schoolId,
        fileUrl: fileUrl || '',
        fileName: fileName || '',
        content: content || '',
        status: 'submitted',
      },
      include: {
        student: { select: { id: true, fullName: true } },
      },
    });

    // Notify teacher
    if (homework.teacherId && shouldNotifyTeacher) {
      const { notifyUser } = await import('@/services/notifications/notificationEngine');
      notifyUser({
        schoolId,
        userId: homework.teacherId,
        senderId: studentId,
        title: `📥 Devoir rendu : ${homework.title}`,
        message: `${submission.student.fullName} a rendu son travail.`,
        type: 'HOMEWORK_SUBMISSION',
        priority: 'NORMAL',
        metadata: { submissionId: submission.id, homeworkId },
      }).catch((e) => console.error('[Submission] Notification trigger error:', e));
    }

    return NextResponse.json({ submission }, { status: previousSubmission ? 200 : 201 });
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
