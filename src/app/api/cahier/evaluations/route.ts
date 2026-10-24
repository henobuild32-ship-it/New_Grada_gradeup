import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import {
  recomputeStudentPeriodGrade,
  recomputeEvaluationGrades,
} from '@/lib/grade-service';
import { assertGradePeriodOpen } from '@/lib/academic-closures';

/**
 * GET /api/cahier/evaluations
 * Query params: schoolId, classId, courseId, period (optional)
 * Returns all students, evaluations, and marks for a class + course.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (!['ADMIN', 'TEACHER'].includes(auth.role)) {
      return NextResponse.json({ error: 'Accès réservé aux professeurs et administrateurs.' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const classId = searchParams.get('classId');
    const courseId = searchParams.get('courseId');
    const period = searchParams.get('period'); // "P1" | "P2" | "EX1" | "P3" | "P4" | "EX2" (optional)
    let schoolYearId = searchParams.get('schoolYearId');

    if (!schoolId || !classId || !courseId) {
      return NextResponse.json(
        { error: 'Missing required query parameters: schoolId, classId, courseId' },
        { status: 400 }
      );
    }
    if (schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Établissement invalide.' }, { status: 403 });
    }
    const course = await db.course.findFirst({
      where: { id: courseId, schoolId, classId, deletedAt: null },
      select: { teacherId: true },
    });
    if (!course || (auth.role === 'TEACHER' && course.teacherId !== auth.userId)) {
      return NextResponse.json({ error: 'Vous n’êtes pas autorisé à consulter ce cahier.' }, { status: 403 });
    }
    // 1. Fetch all students enrolled in the class
    const enrollments = await db.enrolledClass.findMany({
      where: { classId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            postName: true,
            gender: true,
          },
        },
      },
    });

    const students = enrollments
      .map((e) => e.user)
      .filter((u) => u !== null)
      .sort((a, b) =>
        `${a.fullName} ${a.postName}`.localeCompare(`${b.fullName} ${b.postName}`, 'fr', { sensitivity: 'base' })
      );

    if (schoolYearId) {
      const year = await db.schoolYear.findFirst({ where: { id: schoolYearId, schoolId, deletedAt: null }, select: { id: true } });
      if (!year) return NextResponse.json({ error: 'Année scolaire introuvable dans cet établissement.' }, { status: 400 });
    } else {
      const activeYear = await db.schoolYear.findFirst({ where: { schoolId, status: 'OPEN', deletedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      schoolYearId = activeYear?.id || null;
    }

    // 2. Fetch all evaluations for this course, academic year and period.
    const evaluationWhere: Record<string, unknown> = { schoolId, classId, courseId };
    if (period) {
      evaluationWhere.trimester = period;
    }
    if (schoolYearId) evaluationWhere.schoolYearId = schoolYearId;

    const evaluations = await db.cahierEvaluation.findMany({
      where: evaluationWhere,
      include: {
        marks: true,
        transmissions: { select: { status: true, notes: true, sentAt: true, receivedAt: true } },
      },
      orderBy: { date: 'asc' },
    });

    return NextResponse.json({
      students,
      evaluations,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/cahier/evaluations
 * Body: { schoolId, classId, courseId, title, maxScore, period, date }
 * Creates a new evaluation column in the cahier.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const body = await request.json();
    const { schoolId, classId, courseId, title, maxScore, period, date, teacherId, marks, schoolYearId: requestedSchoolYearId,
      sourceDocumentPath, sourceDocumentName, ocrSourceText, ocrCorrections, ocrConfidence, ocrProvider } = body;

    if (!['ADMIN', 'TEACHER'].includes(auth.role)) {
      return NextResponse.json({ error: 'Accès réservé aux professeurs et administrateurs.' }, { status: 403 });
    }

    if (!schoolId || !classId || !courseId || !title || !period) {
      return NextResponse.json(
        { error: 'Missing required fields: schoolId, classId, courseId, title, period' },
        { status: 400 }
      );
    }
    if (schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Établissement invalide.' }, { status: 403 });
    }
    const course = await db.course.findFirst({
      where: { id: courseId, schoolId, classId, deletedAt: null },
      select: { teacherId: true },
    });
    if (!course || (auth.role === 'TEACHER' && course.teacherId !== auth.userId)) {
      return NextResponse.json({ error: 'Vous n’êtes pas autorisé à créer cette évaluation.' }, { status: 403 });
    }
    if (sourceDocumentPath !== undefined) {
      const expectedPrefix = `cahier/${schoolId}/${classId}/`;
      if (typeof sourceDocumentPath !== 'string' || !sourceDocumentPath.startsWith(expectedPrefix) || sourceDocumentPath.includes('..')) {
        return NextResponse.json({ error: 'La source OCR ne correspond pas à cette classe.' }, { status: 400 });
      }
    }
    if (marks !== undefined && (!marks || typeof marks !== 'object' || Array.isArray(marks))) {
      return NextResponse.json({ error: 'Les notes OCR sont invalides.' }, { status: 400 });
    }
    if (ocrCorrections !== undefined && (!Array.isArray(ocrCorrections) || ocrCorrections.length > 500)) {
      return NextResponse.json({ error: 'Les corrections OCR sont invalides.' }, { status: 400 });
    }
    const evaluationDate = date ? new Date(date) : new Date();
    let evaluationSchoolYear: { id: string; status: string } | null = null;
    try {
      evaluationSchoolYear = requestedSchoolYearId
        ? await db.schoolYear.findFirst({ where: { id: requestedSchoolYearId, schoolId, deletedAt: null }, select: { id: true, status: true } })
        : await db.schoolYear.findFirst({ where: { schoolId, status: 'OPEN', deletedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true } });
      if (requestedSchoolYearId && !evaluationSchoolYear) return NextResponse.json({ error: 'Année scolaire introuvable dans cet établissement.' }, { status: 400 });
      if (evaluationSchoolYear?.status === 'CLOSED') return NextResponse.json({ error: 'Cette année scolaire est clôturée.' }, { status: 423 });
      await assertGradePeriodOpen({ schoolId, schoolYearId: evaluationSchoolYear?.id, date: evaluationDate, trimester: period || 'P1' });
    } catch (error: unknown) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Période clôturée' }, { status: 423 });
    }

    const maxScoreValue = maxScore ? parseFloat(maxScore) : 20;
    if (!Number.isFinite(maxScoreValue) || maxScoreValue <= 0) {
      return NextResponse.json({ error: 'La note maximale est invalide.' }, { status: 400 });
    }
    const enrollmentIds = marks ? Object.keys(marks as Record<string, unknown>) : [];
    if (enrollmentIds.length) {
      const enrollments = await db.enrolledClass.findMany({
        where: { classId, userId: { in: enrollmentIds } },
        select: { userId: true },
      });
      const enrolledIds = new Set(enrollments.map((enrollment) => enrollment.userId));
      if (enrollmentIds.some((studentId) => !enrolledIds.has(studentId))) {
        return NextResponse.json({ error: 'Une note vise un élève qui n’est pas inscrit dans cette classe.' }, { status: 400 });
      }
      for (const [studentId, value] of Object.entries(marks as Record<string, unknown>)) {
        const score = Number(value);
        if (!studentId || !Number.isFinite(score) || score < 0 || score > maxScoreValue) {
          return NextResponse.json({ error: `Chaque note doit être comprise entre 0 et ${maxScoreValue}.` }, { status: 400 });
        }
      }
    }

    const evaluation = await db.$transaction(async (tx) => {
      const created = await tx.cahierEvaluation.create({
        data: {
        schoolId,
        schoolYearId: evaluationSchoolYear?.id || null,
        classId,
        courseId,
        title,
        maxScore: maxScoreValue,
        trimester: period,
        teacherId: auth.role === 'TEACHER' ? auth.userId : (teacherId || course.teacherId),
        date: evaluationDate,
        ...(sourceDocumentPath ? {
          sourceDocumentPath,
          sourceDocumentName: typeof sourceDocumentName === 'string' ? sourceDocumentName.slice(0, 150) : '',
          ocrSourceText: typeof ocrSourceText === 'string' ? ocrSourceText.slice(0, 30_000) : '',
          ocrCorrections: Array.isArray(ocrCorrections) ? ocrCorrections.slice(0, 500).map((row: unknown) => {
            const item = row && typeof row === 'object' ? row as Record<string, unknown> : {};
            return {
              studentId: typeof item.studentId === 'string' ? item.studentId.slice(0, 100) : '',
              sourceName: typeof item.sourceName === 'string' ? item.sourceName.slice(0, 150) : '',
              sourceLine: typeof item.sourceLine === 'string' ? item.sourceLine.slice(0, 500) : '',
              score: typeof item.score === 'string' ? item.score.slice(0, 20) : '',
              confirmed: item.confirmed === true,
            };
          }) : [],
          ocrConfidence: ocrConfidence !== null && ocrConfidence !== undefined && Number.isFinite(Number(ocrConfidence)) ? Math.max(0, Math.min(100, Number(ocrConfidence))) : null,
          ocrProvider: typeof ocrProvider === 'string' ? ocrProvider.slice(0, 40) : '',
        } : {}),
      },
      });
      if (enrollmentIds.length) {
        await tx.cahierMark.createMany({
          data: enrollmentIds.map((studentId) => ({
            evaluationId: created.id,
            studentId,
            score: Number((marks as Record<string, unknown>)[studentId]),
          })),
          skipDuplicates: true,
        });
      }
      return created;
    });

    for (const studentId of enrollmentIds) {
      await recomputeStudentPeriodGrade({ schoolId, courseId, studentId, period, teacherId: evaluation.teacherId });
    }

    return NextResponse.json({ evaluation }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/cahier/evaluations
 * Body: { evaluationId, marks: { [studentId]: score } }
 * Updates the marks for a specific evaluation column, and recalculates the average period Grade.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (!['ADMIN', 'TEACHER'].includes(auth.role)) {
      return NextResponse.json({ error: 'Accès réservé aux professeurs et administrateurs.' }, { status: 403 });
    }
    const body = await request.json();
    const { evaluationId, marks } = body;

    if (!evaluationId || !marks) {
      return NextResponse.json(
        { error: 'Missing required fields: evaluationId, marks' },
        { status: 400 }
      );
    }

    const evaluation = await db.cahierEvaluation.findUnique({
      where: { id: evaluationId },
    });

    if (!evaluation) {
      return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 });
    }
    if (auth.schoolId !== evaluation.schoolId) {
      return NextResponse.json({ error: 'Évaluation hors de votre établissement' }, { status: 403 });
    }

    if (auth.role !== 'ADMIN') {
      const course = await db.course.findFirst({
        where: { id: evaluation.courseId, schoolId: evaluation.schoolId, teacherId: auth.userId, deletedAt: null },
        select: { id: true },
      });
      if (!course) {
      return NextResponse.json(
        { error: 'Vous devez être le professeur affecté à cette matière pour modifier ces notes.' },
        { status: 403 }
      );
      }
    }
    if (!marks || typeof marks !== 'object' || Array.isArray(marks) || Object.keys(marks).length > 500) {
      return NextResponse.json({ error: 'La liste des notes est invalide.' }, { status: 400 });
    }
    try {
      await assertGradePeriodOpen({ schoolId: evaluation.schoolId, schoolYearId: evaluation.schoolYearId || undefined, date: evaluation.date, trimester: evaluation.trimester });
    } catch (error: unknown) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Période clôturée' }, { status: 423 });
    }

    const { schoolId, courseId, trimester } = evaluation;
    // Update or create marks in transaction
    const studentIds = Object.keys(marks);
    const enrollments = await db.enrolledClass.findMany({
      where: { classId: evaluation.classId, userId: { in: studentIds } },
      select: { userId: true },
    });
    const enrolledIds = new Set(enrollments.map((enrollment) => enrollment.userId));
    if (studentIds.some((studentId) => !enrolledIds.has(studentId))) {
      return NextResponse.json({ error: 'Une note vise un élève qui n’est pas inscrit dans cette classe.' }, { status: 400 });
    }
    const validatedMarks: Record<string, number> = {};
    for (const [studentId, value] of Object.entries(marks as Record<string, unknown>)) {
      const score = Number(value);
      if (!Number.isFinite(score) || score < 0 || score > evaluation.maxScore) {
        return NextResponse.json({ error: `Chaque note doit être comprise entre 0 et ${evaluation.maxScore}.` }, { status: 400 });
      }
      validatedMarks[studentId] = score;
    }
    await db.$transaction(
      studentIds.map((studentId) =>
        db.cahierMark.upsert({
          where: {
            evaluationId_studentId: {
              evaluationId,
              studentId,
            },
          },
          update: {
            score: validatedMarks[studentId],
          },
          create: {
            evaluationId,
            studentId,
            score: validatedMarks[studentId],
          },
        })
      )
    );

    // ── Sync with Grade model + bulletins (single source of truth) ──
    for (const studentId of studentIds) {
      await recomputeStudentPeriodGrade({ schoolId, courseId, studentId, period: trimester });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PATCH /api/cahier/evaluations
 * Body: { evaluationId, title?, maxScore?, date? }
 * Edits the metadata of an evaluation column (title, max score, date) and
 * recomputes the affected grades + bulletins in real time.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const body = await request.json();
    const { evaluationId, title, maxScore, date } = body;

    if (!evaluationId) {
      return NextResponse.json(
        { error: 'Missing required field: evaluationId' },
        { status: 400 }
      );
    }

    const evaluation = await db.cahierEvaluation.findUnique({
      where: { id: evaluationId },
    });
    if (!evaluation) {
      return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 });
    }

    if (auth.schoolId !== evaluation.schoolId || !['ADMIN', 'TEACHER'].includes(auth.role)) {
      return NextResponse.json({ error: 'Évaluation hors de votre établissement ou rôle non autorisé.' }, { status: 403 });
    }

    // Only the course teacher or an admin may edit the evaluation.
    if (auth.role !== 'ADMIN') {
      const course = await db.course.findUnique({
        where: { id: evaluation.courseId },
        select: { teacherId: true, schoolId: true },
      });
      if (!course || course.schoolId !== auth.schoolId || course.teacherId !== auth.userId) {
        return NextResponse.json(
          { error: 'Vous n\'êtes pas autorisé à modifier cette évaluation' },
          { status: 403 }
        );
      }
    }
    try {
      await assertGradePeriodOpen({ schoolId: evaluation.schoolId, schoolYearId: evaluation.schoolYearId || undefined, date: date ? new Date(date) : evaluation.date, trimester: evaluation.trimester });
    } catch (error: unknown) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Période clôturée' }, { status: 423 });
    }

    const data: Record<string, unknown> = {};
    if (typeof title === 'string' && title.trim()) data.title = title.trim();
    if (maxScore !== undefined && maxScore !== '') {
      const parsed = parseFloat(maxScore);
      if (isNaN(parsed) || parsed <= 0) {
        return NextResponse.json({ error: 'Note maximale invalide' }, { status: 400 });
      }
      data.maxScore = parsed;
    }
    if (date) {
      const parsedDate = new Date(date);
      if (!isNaN(parsedDate.getTime())) data.date = parsedDate;
    }

    const updated = await db.cahierEvaluation.update({
      where: { id: evaluationId },
      data,
    });

    // Recompute grades & bulletins since maxScore / period may have changed.
    await recomputeEvaluationGrades(updated);

    return NextResponse.json({ evaluation: updated });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/cahier/evaluations
 * Body: { evaluationId }
 * Deletes an evaluation column from the cahier.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const { searchParams } = new URL(request.url);
    const evaluationId = searchParams.get('evaluationId');

    if (!evaluationId) {
      return NextResponse.json({ error: 'evaluationId is required' }, { status: 400 });
    }

    const evaluation = await db.cahierEvaluation.findUnique({
      where: { id: evaluationId },
    });
    if (!evaluation) {
      return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 });
    }

    if (auth.role !== 'ADMIN' || auth.schoolId !== evaluation.schoolId) {
      return NextResponse.json({ error: 'Suppression réservée à l’administrateur de l’établissement.' }, { status: 403 });
    }

    await db.cahierEvaluation.delete({
      where: { id: evaluationId },
    });

    // Recompute grades & bulletins so deleted marks are reflected instantly.
    await recomputeEvaluationGrades(evaluation);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
