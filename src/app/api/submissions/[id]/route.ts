import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth/authenticate';
import { assertSchool, assertTeacherCourse } from '@/lib/api/rbac';
import { ApiError, handleApiError } from '@/lib/api/errors';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    const { id } = await params;
    const body = await request.json();
    const { score, maxScore } = body;

    const existing = await db.submission.findUnique({
      where: { id },
      include: { homework: { select: { id: true, courseId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Soumission introuvable' }, { status: 404 });
    }

    assertSchool(auth, existing.schoolId);

    // Seul le professeur du devoir (ou l'ADMIN) peut noter — jamais un élève/parent
    if (auth.role !== 'ADMIN') {
      if (auth.role !== 'TEACHER') {
        throw new ApiError('Accès refusé : réservé aux enseignants ou à l’administration.', 403, 'ROLE_FORBIDDEN');
      }
      await assertTeacherCourse(auth, existing.homework.courseId);
    }

    const submission = await db.submission.update({
      where: { id },
      data: {
        score: score !== undefined ? parseFloat(score) : null,
        maxScore: maxScore !== undefined ? parseFloat(maxScore) : null,
        gradedAt: new Date(),
        gradedBy: auth.userId,
        status: 'graded',
      },
      include: {
        student: { select: { id: true, fullName: true, parentId: true } },
        homework: { select: { title: true } },
      },
    });

    if (submission.studentId) {
      const { notifyUser } = await import('@/services/notifications/notificationEngine');
      const scoreText = `${submission.score !== null ? submission.score : '-'}/${submission.maxScore || 20}`;
      const hwTitle = submission.homework?.title || 'Devoir';

      // Notify Student
      notifyUser({
        schoolId: submission.schoolId,
        userId: submission.studentId,
        senderId: auth.userId,
        title: `✅ Devoir corrigé : ${hwTitle}`,
        message: `Votre devoir a été corrigé. Note : ${scoreText}`,
        type: 'GRADE',
        priority: 'HIGH',
        metadata: { submissionId: submission.id },
      }).catch((e) => console.error('[Grading] Student notification error:', e));

      // Notify Parent
      if (submission.student?.parentId) {
        notifyUser({
          schoolId: submission.schoolId,
          userId: submission.student.parentId,
          senderId: auth.userId,
          title: `✅ Devoir corrigé (${submission.student.fullName})`,
          message: `${hwTitle} : Note ${scoreText}`,
          type: 'GRADE',
          priority: 'HIGH',
          metadata: { submissionId: submission.id },
        }).catch((e) => console.error('[Grading] Parent notification error:', e));
      }
    }

    return NextResponse.json({ submission });
  } catch (err: unknown) {
    return handleApiError(err);
  }
}
