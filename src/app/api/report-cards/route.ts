import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { syncStudentReport } from '@/lib/grade-sync';

const REPORT_CARD_STATUSES = ['auto_draft', 'draft', 'pending_admin', 'validated', 'published'] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const teacherId = searchParams.get('teacherId');
    const classId = searchParams.get('classId');
    const status = searchParams.get('status');
    const studentId = searchParams.get('studentId');

    if (!schoolId || schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'schoolId invalide' }, { status: 400 });
    }
    if (!['ADMIN', 'TEACHER', 'STUDENT', 'PARENT'].includes(auth.role)) {
      return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 });
    }
    if (status && !REPORT_CARD_STATUSES.includes(status as (typeof REPORT_CARD_STATUSES)[number])) {
      return NextResponse.json({ error: 'Statut de bulletin invalide.' }, { status: 400 });
    }

    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (classId) where.classId = classId;
    if (status) where.status = status;
    if (studentId) where.studentId = studentId;

    if (auth.role === 'STUDENT') {
      where.studentId = auth.userId;
      where.status = 'published';
    } else if (auth.role === 'PARENT') {
      const children = await db.user.findMany({
        where: { schoolId, parentId: auth.userId, role: 'STUDENT', deletedAt: null },
        select: { id: true },
      });
      where.studentId = { in: children.map((child) => child.id) };
      where.status = 'published';
    } else if (auth.role === 'TEACHER') {
      const courses = await db.course.findMany({
        where: { schoolId, teacherId: auth.userId, deletedAt: null },
        select: { classId: true },
        distinct: ['classId'],
      });
      const classIds = courses.map((course) => course.classId);
      if (classId && !classIds.includes(classId)) {
        return NextResponse.json({ error: 'Cette classe ne vous est pas attribuée.' }, { status: 403 });
      }
      where.classId = classId || { in: classIds };
    }

    const reportCards = await db.reportCard.findMany({
      where,
      include: {
        student: { select: { id: true, fullName: true, photoUrl: true } },
        class: { select: { id: true, name: true, level: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ reportCards });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const body = await request.json();
    const { schoolId, studentId, trimester } = body;

    if (!schoolId || schoolId !== auth.schoolId || !studentId || !trimester) {
      return NextResponse.json({ error: 'schoolId, studentId et trimestre sont requis.' }, { status: 400 });
    }
    if (auth.role === 'STUDENT' || auth.role === 'PARENT') {
      return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 });
    }
    if (auth.role === 'TEACHER') {
      const grade = await db.grade.findFirst({
        where: { schoolId, studentId, teacherId: auth.userId },
        select: { id: true },
      });
      if (!grade) {
        return NextResponse.json({ error: 'Vous ne pouvez générer que les bulletins de vos classes attribuées.' }, { status: 403 });
      }
    }

    const result = await syncStudentReport(schoolId, studentId, trimester);
    if (!result) {
      return NextResponse.json({ error: 'Aucune cotation réelle ne permet de générer ce bulletin.' }, { status: 422 });
    }
    const reportCard = await db.reportCard.findUnique({
      where: { id: result.reportCardId },
    });
    return NextResponse.json({ reportCard, synchronized: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const body = await request.json();
    const { id, status } = body ?? {};

    if (typeof id !== 'string' || !id.trim() || typeof status !== 'string') {
      return NextResponse.json({ error: 'id et status sont requis.' }, { status: 400 });
    }
    if (Object.keys(body).some((key) => !['id', 'status', 'teacherId'].includes(key))) {
      return NextResponse.json({ error: 'Seul le statut du bulletin peut être modifié par cette route.' }, { status: 400 });
    }

    const existing = await db.reportCard.findUnique({ where: { id }, select: { id: true, schoolId: true, classId: true, studentId: true, trimester: true, status: true, deletedAt: true } });
    if (!existing || existing.schoolId !== auth.schoolId || existing.deletedAt) {
      return NextResponse.json({ error: 'Bulletin introuvable dans cet établissement.' }, { status: 404 });
    }

    if (auth.role === 'TEACHER') {
      const klass = await db.schoolClass.findFirst({
        where: { id: existing.classId, schoolId: auth.schoolId, deletedAt: null },
        select: { titulaireId: true },
      });
      if (klass?.titulaireId !== auth.userId || status !== 'pending_admin') {
        return NextResponse.json({ error: 'Seul le titulaire peut transmettre le bulletin de sa classe.' }, { status: 403 });
      }
      if (!['draft', 'auto_draft'].includes(existing.status)) {
        return NextResponse.json({ error: 'Ce bulletin a déjà été transmis ou traité.' }, { status: 409 });
      }
    } else if (auth.role === 'ADMIN') {
      const allowedTransition =
        (existing.status === 'pending_admin' && status === 'validated') ||
        (existing.status === 'validated' && status === 'published');
      if (!allowedTransition) {
        return NextResponse.json({ error: 'Transition interdite : le bulletin doit être transmis, validé, puis publié.' }, { status: 409 });
      }
    } else {
      return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 });
    }

    const changed = await db.reportCard.updateMany({
      where: { id, schoolId: auth.schoolId, status: existing.status, deletedAt: null },
      data: { status },
    });
    if (changed.count !== 1) {
      return NextResponse.json({ error: 'Le bulletin a changé entre-temps. Rechargez la page.' }, { status: 409 });
    }
    const reportCard = await db.reportCard.findUnique({ where: { id } });

    if (status === 'pending_admin') {
      const report = await db.reportCard.findUnique({
        where: { id },
        select: { schoolId: true, student: { select: { id: true, fullName: true } } },
      });
      if (report) {
        try {
          const { notifyUser } = await import('@/services/notifications/notificationEngine');
          await notifyUser({
            schoolId: report.schoolId,
            targetRole: 'ADMIN',
            title: '📄 Bulletin transmis par un professeur',
            message: `Un bulletin pour ${report.student.fullName} a été créé et transmis pour validation.`,
            type: 'REPORT_CARD',
            priority: 'HIGH',
            senderId: auth.userId,
            metadata: { reportCardId: id },
          });
        } catch { /* non-blocking */ }
      }
    }

    // When published, notify student and parent
    if (status === 'published') {
      const report = await db.reportCard.findUnique({
        where: { id },
        select: { schoolId: true, trimester: true, studentId: true, averageGrade: true, mention: true, student: { select: { id: true, fullName: true, parentId: true } } },
      });
      if (report) {
        try {
          const { notifyUser } = await import('@/services/notifications/notificationEngine');
          const avgStr = report.averageGrade ? ` (Moyenne : ${report.averageGrade}/20)` : '';

          // Student
          await notifyUser({
            schoolId: report.schoolId,
            userId: report.studentId,
            title: `📑 Bulletin publié (Trimestre ${report.trimester})`,
            message: `Votre bulletin du trimestre ${report.trimester} est maintenant disponible${avgStr}.`,
            type: 'REPORT_CARD',
            priority: 'HIGH',
            metadata: { reportCardId: id },
          });

          // Parent
          if (report.student?.parentId) {
            await notifyUser({
              schoolId: report.schoolId,
              userId: report.student.parentId,
              title: `📑 Bulletin de ${report.student.fullName} (Trimestre ${report.trimester})`,
              message: `Le bulletin de votre enfant pour le trimestre ${report.trimester} est disponible${avgStr}.`,
              type: 'REPORT_CARD',
              priority: 'HIGH',
              metadata: { reportCardId: id },
            });
          }
        } catch { /* non-blocking */ }
      }
    }

    return NextResponse.json({ reportCard });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const existing = await db.reportCard.findUnique({ where: { id }, select: { schoolId: true } });
    if (!existing || existing.schoolId !== auth.schoolId || auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Suppression réservée à l’administrateur de l’établissement.' }, { status: 403 });
    }
    await db.reportCard.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
