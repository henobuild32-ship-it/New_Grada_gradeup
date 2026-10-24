import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireActiveAuth } from '@/lib/api/rbac';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { auditFromRequest } from '@/lib/api/audit';
import { computeClassRanking, computeStudentAverage, getMention } from '@/lib/business/average-service';

const generateSchema = z.object({
  classId: z.string().trim().min(1),
  term: z.coerce.number().int().min(1).max(4),
  academicYear: z.string().trim().regex(/^\d{4}-\d{4}$/).optional(),
}).strict();

/** POST /api/bulletins/generate — génère des brouillons à partir des notes enregistrées. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireActiveAuth(req, ['ADMIN', 'TEACHER']);
    const parsed = generateSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError('Classe, période (1–4) et année scolaire valides requis.', 400, 'VALIDATION_ERROR');
    const { classId, term } = parsed.data;
    const klass = await db.schoolClass.findFirst({
      where: { id: classId, schoolId: auth.schoolId, deletedAt: null },
      select: { id: true, name: true, titulaireId: true },
    });
    if (!klass) throw new ApiError('Classe introuvable dans cet établissement.', 404, 'CLASS_NOT_FOUND');
    if (auth.role === 'TEACHER' && klass.titulaireId !== auth.userId) throw new ApiError('Seul le titulaire de la classe peut générer ses bulletins.', 403, 'OWNERSHIP_FORBIDDEN');

    const schoolYear = parsed.data.academicYear
      ? { year: parsed.data.academicYear }
      : await db.schoolYear.findFirst({ where: { schoolId: auth.schoolId, status: 'OPEN' }, select: { year: true } });
    if (!schoolYear?.year) throw new ApiError('Aucune année scolaire ouverte n’est configurée.', 409, 'NO_OPEN_SCHOOL_YEAR');
    const academicYear = schoolYear.year;

    const enrollments = await db.enrolledClass.findMany({
      where: { classId, class: { schoolId: auth.schoolId }, user: { schoolId: auth.schoolId, role: 'STUDENT', active: true, deletedAt: null } },
      select: { user: { select: { id: true, fullName: true } } },
      orderBy: { user: { fullName: 'asc' } },
    });
    if (!enrollments.length) throw new ApiError('Cette classe ne contient aucun élève actif.', 422, 'EMPTY_CLASS');

    const studentIds = enrollments.map((enrollment) => enrollment.user.id);
    const gradeRows = await db.grade.findMany({
      where: {
        schoolId: auth.schoolId,
        studentId: { in: studentIds },
        trimester: String(term),
        deletedAt: null,
        course: { is: { schoolId: auth.schoolId, classId } },
      },
      include: { course: { select: { id: true, name: true, coefficient: true, maxScore: true } } },
      orderBy: [{ course: { name: 'asc' } }, { createdAt: 'asc' }],
    });
    const studentsWithoutGrades = studentIds.filter((studentId) => !gradeRows.some((grade) => grade.studentId === studentId));
    if (studentsWithoutGrades.length) {
      const names = enrollments.filter((enrollment) => studentsWithoutGrades.includes(enrollment.user.id)).map((enrollment) => enrollment.user.fullName);
      throw new ApiError(`Bulletins non générés : notes manquantes pour ${names.join(', ')}.`, 422, 'GRADES_MISSING');
    }

    const ranking = await computeClassRanking(auth.schoolId, classId, { trimester: String(term) });
    const attendanceRows = await db.attendance.findMany({
      where: { schoolId: auth.schoolId, studentId: { in: studentIds }, deletedAt: null },
      select: { studentId: true, status: true },
    });
    const now = new Date();
    const generated: Array<{ id: string; studentId: string; average: number; rank: number | null; status: string }> = [];
    const unchanged: string[] = [];

    for (const enrollment of enrollments) {
      const studentId = enrollment.user.id;
      const average = await computeStudentAverage(auth.schoolId, studentId, { trimester: String(term), classId });
      const rank = ranking.find((row) => row.studentId === studentId)?.rank ?? null;
      const studentGrades = gradeRows.filter((grade) => grade.studentId === studentId);
      const gradesSnapshot = studentGrades.map((grade) => ({
        courseId: grade.courseId,
        course: grade.course.name,
        score: grade.score,
        max: grade.maxScore,
        comment: grade.comment || '',
        coefficient: grade.course.coefficient || 1,
      }));
      const studentAttendance = attendanceRows.filter((row) => row.studentId === studentId);
      const attendanceSummary = {
        present: studentAttendance.filter((row) => row.status.toLowerCase() === 'present').length,
        absent: studentAttendance.filter((row) => row.status.toLowerCase() === 'absent').length,
        late: studentAttendance.filter((row) => row.status.toLowerCase() === 'late').length,
        total: studentAttendance.length,
      };
      const existing = await db.bulletin.findUnique({ where: { studentId_term_academicYear: { studentId, term, academicYear } } });
      if (existing && existing.status !== 'DRAFT') {
        unchanged.push(existing.id);
        continue;
      }
      const bulletin = existing
        ? await db.bulletin.update({
            where: { id: existing.id },
            data: { classId, average: average.weightedAverage, rank, mention: getMention(average.percentage), gradesSnapshot, attendanceSummary, updatedAt: now, version: { increment: 1 } },
          })
        : await db.bulletin.create({
            data: { studentId, classId, schoolId: auth.schoolId, term, academicYear, average: average.weightedAverage, rank, mention: getMention(average.percentage), gradesSnapshot, attendanceSummary, status: 'DRAFT' },
          });
      generated.push({ id: bulletin.id, studentId, average: bulletin.average, rank: bulletin.rank, status: bulletin.status });
    }

    await auditFromRequest(req, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'BULLETINS_GENERATE',
      entity: 'Bulletin',
      entityId: classId,
      after: { classId, term, academicYear, generated: generated.length, unchanged: unchanged.length },
    });
    return Response.json({ classId, className: klass.name, term, academicYear, generated, unchanged }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
