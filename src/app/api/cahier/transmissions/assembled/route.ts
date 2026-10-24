import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireActiveAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireActiveAuth(request, ['ADMIN', 'TEACHER']);
    const { searchParams } = new URL(request.url);
    // Tenant forcé à la session ; un titulaire ne voit que ses propres classes
    const schoolId = auth.schoolId;
    const titulaireId = auth.role === 'TEACHER' ? auth.userId : searchParams.get('titulaireId');
    const classId = searchParams.get('classId');
    const trimester = searchParams.get('trimester');
    const requestedSchoolYearId = searchParams.get('schoolYearId');

    if (!titulaireId) {
      return NextResponse.json({ error: 'titulaireId et schoolId requis' }, { status: 400 });
    }

    // Vérifier que l'utilisateur est bien titulaire de la classe
    const classInfo = classId
      ? await db.schoolClass.findFirst({
          where: { id: classId, schoolId, ...(auth.role === 'TEACHER' ? { titulaireId: auth.userId } : {}) },
          select: { id: true, name: true },
        })
      : null;
    if (classId && !classInfo) return NextResponse.json({ error: 'Classe non autorisée ou introuvable.' }, { status: 403 });

    // Récupérer les classes du titulaire
    const classes = await db.schoolClass.findMany({
      where: {
        schoolId,
        titulaireId,
        deletedAt: null,
        ...(classId ? { id: classId } : {}),
      },
      select: { id: true, name: true, level: true },
    });

    if (classes.length === 0) {
      return NextResponse.json({ students: [], courses: [] });
    }

    const schoolYear = requestedSchoolYearId
      ? await db.schoolYear.findFirst({ where: { id: requestedSchoolYearId, schoolId, deletedAt: null }, select: { id: true } })
      : await db.schoolYear.findFirst({ where: { schoolId, status: 'OPEN', deletedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    if (requestedSchoolYearId && !schoolYear) return NextResponse.json({ error: 'Année scolaire introuvable.' }, { status: 400 });

    const classIds = classes.map(c => c.id);

    // Récupérer tous les élèves inscrits dans ces classes
    const enrollments = await db.enrolledClass.findMany({
      where: { classId: { in: classIds } },
      include: {
        user: {
          select: { id: true, fullName: true, postName: true, gender: true, cardId: true },
        },
        class: { select: { id: true, name: true } },
      },
    });

    const students = enrollments.map(e => ({
      id: e.user.id,
      fullName: e.user.fullName,
      postName: e.user.postName,
      gender: e.user.gender,
      cardId: e.user.cardId,
      classId: e.class.id,
      className: e.class.name,
    }));

    // Récupérer tous les cours de ces classes
    const courses = await db.course.findMany({
      where: { classId: { in: classIds }, schoolId, deletedAt: null },
      select: { id: true, name: true, classId: true, teacherId: true },
    });

    // Seules les cotations validées alimentent les moyennes et les bulletins.
    const transmissionWhere: Record<string, unknown> = {
      classId: { in: classIds },
      schoolId,
      status: 'RECEIVED',
    };
    if (trimester) {
      transmissionWhere.evaluation = { trimester };
    }
    if (schoolYear) transmissionWhere.evaluation = { ...(transmissionWhere.evaluation as object || {}), schoolYearId: schoolYear.id };

    const transmissions = await db.cotationTransmission.findMany({
      where: transmissionWhere,
      include: {
        evaluation: {
          include: {
            marks: {
              select: { studentId: true, score: true, evaluationId: true },
            },
          },
        },
        course: { select: { id: true, name: true, classId: true } },
        teacher: { select: { id: true, fullName: true } },
      },
    });

    // Organiser les notes par élève, par cours, par évaluation
    const studentNotes: Record<string, Record<string, Record<string, number>>> = {};
    const courseNames: Record<string, string> = {};

    for (const c of courses) {
      courseNames[c.id] = c.name;
    }

    for (const trans of transmissions) {
      if (trans.status === 'PENDING' || !trans.evaluation) continue;

      const courseId = trans.courseId;
      const evaluationId = trans.evaluationId;
      const evaluation = trans.evaluation;

      for (const mark of evaluation.marks) {
        if (!studentNotes[mark.studentId]) studentNotes[mark.studentId] = {};
        if (!studentNotes[mark.studentId][courseId]) studentNotes[mark.studentId][courseId] = {};
        // Normaliser chaque évaluation sur 20 avant le calcul centralisé.
        const maxScore = evaluation.maxScore > 0 ? evaluation.maxScore : 20;
        studentNotes[mark.studentId][courseId][evaluationId] = (mark.score / maxScore) * 20;
      }
    }

    // Construire la réponse consolidée par élève
    const consolidated = students.map(student => {
      const notesByCourse: Record<string, { evaluations: Record<string, number>; average: number | null; count: number }> = {};

      const sNotes = studentNotes[student.id] || {};

      for (const course of courses) {
        const courseId = course.id;
        const evals = sNotes[courseId] || {};
        const scores = Object.values(evals);
        const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
        notesByCourse[course.name] = {
          evaluations: evals,
          average: avg === null ? null : Math.round(avg * 10) / 10,
          count: scores.length,
        };
      }

      return {
        ...student,
        notesByCourse,
      };
    });

    return NextResponse.json({
      students: consolidated,
      courses: courses.map(c => ({ id: c.id, name: c.name, classId: c.classId })),
      classes: classes,
    });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
