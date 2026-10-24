import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, AuthError } from '@/lib/auth/authenticate';
import { getRdcThresholds } from '@/lib/business/rules';
import { resolveClassCoefficients } from '@/lib/coefficient-resolver';

/** Signaux de décision calculés à partir des données de l'établissement. */
export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if (auth.role !== 'ADMIN') return NextResponse.json({ error: 'Réservé à l’administration.' }, { status: 403 });

    const students = await db.user.findMany({
      where: { schoolId: auth.schoolId, role: 'STUDENT', active: true, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        classEnrollments: { where: { class: { schoolId: auth.schoolId, deletedAt: null } }, orderBy: { createdAt: 'asc' }, take: 1, select: { classId: true, class: { select: { name: true } } } },
      },
    });
    const studentIds = students.map((student) => student.id);
    const activePeriod = await db.period.findFirst({
      where: { schoolId: auth.schoolId, status: 'OPEN', isLocked: false, deletedAt: null },
      orderBy: { startDate: 'asc' }, select: { code: true, trimester: true, name: true },
    });
    const since = new Date(); since.setDate(since.getDate() - 30);
    const today = new Date().toISOString().slice(0, 10);
    const [grades, attendance, overdueInstallments, schoolYear] = await Promise.all([
      studentIds.length ? db.grade.findMany({
        where: { schoolId: auth.schoolId, studentId: { in: studentIds }, deletedAt: null, ...(activePeriod ? { trimester: String(activePeriod.trimester) } : {}) },
        include: { course: { select: { id: true, name: true, classId: true, coefficient: true, maxScore: true } } },
      }) : Promise.resolve([]),
      studentIds.length ? db.presence.findMany({ where: { schoolId: auth.schoolId, userId: { in: studentIds }, date: { gte: since }, deletedAt: null }, select: { userId: true, statut: true } }) : Promise.resolve([]),
      studentIds.length ? db.installment.findMany({ where: { schoolId: auth.schoolId, studentId: { in: studentIds }, dueDate: { lt: today }, status: { not: 'PAID' }, deletedAt: null }, select: { studentId: true } }) : Promise.resolve([]),
      db.schoolYear.findFirst({ where: { schoolId: auth.schoolId, status: { not: 'CLOSED' } }, orderBy: { createdAt: 'desc' }, select: { id: true } }),
    ]);

    const coefficients: Record<string, number> = {};
    const coursesByClass = new Map<string, Array<{ id: string; coefficient: number }>>();
    for (const grade of grades) {
      const classId = grade.course.classId;
      const items = classId ? coursesByClass.get(classId) ?? [] : [];
      if (classId && !items.some((item) => item.id === grade.courseId)) {
        items.push({ id: grade.courseId, coefficient: grade.course.coefficient || 1 });
        coursesByClass.set(classId, items);
      }
    }
    for (const [classId, courses] of coursesByClass) {
      const resolved = await resolveClassCoefficients(auth.schoolId, classId, courses);
      Object.assign(coefficients, resolved.byCourse);
    }

    const studentById = new Map(students.map((student) => [student.id, student]));
    const gradeGroups = new Map<string, Map<string, { scores: number[]; max: number; coefficient: number; name: string }>>();
    for (const grade of grades) {
      const classId = studentById.get(grade.studentId)?.classEnrollments[0]?.classId;
      if (!classId || grade.course.classId !== classId) continue;
      const byCourse = gradeGroups.get(grade.studentId) ?? new Map();
      const current = byCourse.get(grade.courseId) ?? { scores: [], max: grade.maxScore || grade.course.maxScore || 20, coefficient: coefficients[grade.courseId] ?? grade.course.coefficient ?? 1, name: grade.course.name };
      current.scores.push(grade.score);
      byCourse.set(grade.courseId, current);
      gradeGroups.set(grade.studentId, byCourse);
    }

    const thresholdsByClass = new Map<string, Awaited<ReturnType<typeof getRdcThresholds>>>();
    const signals: Array<{ studentId: string; name: string; className: string; reasons: string[]; average: number | null; absences30d: number }> = [];
    const absencesByStudent = new Map<string, number>();
    for (const row of attendance) {
      const status = row.statut.toLowerCase();
      if (status === 'absent' || status === 'retard' || status === 'late') absencesByStudent.set(row.userId, (absencesByStudent.get(row.userId) || 0) + 1);
    }
    const overdueStudents = new Set(overdueInstallments.map((item) => item.studentId));

    for (const student of students) {
      const enrollment = student.classEnrollments[0];
      const classId = enrollment?.classId;
      const absences30d = absencesByStudent.get(student.id) || 0;
      const reasons: string[] = [];
      const byCourse = classId ? gradeGroups.get(student.id) : undefined;
      let average: number | null = null;
      if (!byCourse?.size && activePeriod) reasons.push(`Aucune note enregistrée pour ${activePeriod.name}`);
      else if (byCourse?.size) {
        let weighted = 0; let coefficientTotal = 0; let failed = 0; let eliminatory = false;
        for (const subject of byCourse.values()) {
          const scoreRatio = subject.max > 0 ? subject.scores.reduce((sum, score) => sum + score, 0) / subject.scores.length / subject.max : 0;
          weighted += scoreRatio * 100 * subject.coefficient;
          coefficientTotal += subject.coefficient;
          if (scoreRatio < 0.5) failed++;
        }
        average = coefficientTotal ? weighted / coefficientTotal : null;
        if (classId) {
          let thresholds = thresholdsByClass.get(classId);
          if (!thresholds) { thresholds = await getRdcThresholds(auth.schoolId, classId); thresholdsByClass.set(classId, thresholds); }
          eliminatory = thresholds.eliminationPercentage !== null && [...byCourse.values()].some((subject) => subject.scores.reduce((sum, score) => sum + score, 0) / subject.scores.length / subject.max * 100 < thresholds!.eliminationPercentage!);
          if (average !== null && (average < thresholds.retakeMinPercentage || eliminatory || (average < thresholds.passPercentage && failed > thresholds.maxFailedCourses))) reasons.push(`Résultats scolaires à suivre (${average.toFixed(1)} %) `);
        }
      }
      if (absences30d >= 3) reasons.push(`${absences30d} absences/retards sur 30 jours`);
      if (overdueStudents.has(student.id)) reasons.push('Tranche scolaire échue et non réglée');
      if (reasons.length) signals.push({ studentId: student.id, name: student.fullName, className: enrollment?.class.name || 'Sans classe', reasons, average: average === null ? null : Math.round(average * 10) / 10, absences30d });
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      period: activePeriod ? { code: activePeriod.code, name: activePeriod.name } : null,
      academicYearId: schoolYear?.id || null,
      totals: { activeStudents: students.length, studentsToFollow: signals.length, academicSignals: signals.filter((item) => item.reasons.some((reason) => reason.startsWith('Résultats') || reason.startsWith('Aucune note'))).length, attendanceSignals: signals.filter((item) => item.absences30d >= 3).length, overdueStudents: overdueStudents.size },
      signals: signals.sort((a, b) => b.reasons.length - a.reasons.length || (a.average ?? 100) - (b.average ?? 100)).slice(0, 12),
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Impossible de calculer les signaux de suivi.' }, { status: 500 });
  }
}
