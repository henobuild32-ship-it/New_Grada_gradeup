import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/errors';
import { getRdcThresholds } from './rules';
import { resolveClassCoefficients } from '@/lib/coefficient-resolver';
import { calculateStudentAverageFromRows, getMention, rankAverageResults } from './average-calculations';

export { getMention } from './average-calculations';

/**
 * AverageService — calculs serveur des moyennes pondérées, rangs, mentions.
 * Basé sur les moteurs existants (`rdc-grading-engine`, `grade-sync`) mais
 * exposé comme service unique appelable par les routes API et les jobs
 * (génération de bulletin).
 *
 * Note : les moteurs d'affichage (UI) restent dans src/lib/rdc-grading-engine.
 * Ce service est la source de vérité POUR LES ÉCRITURES (bulletins).
 */

export interface SubjectAverage {
  courseId: string;
  courseName: string;
  coefficient: number;
  average: number;      // moyenne de la matière (sur maxScore)
  maxScore: number;
  percentage: number;   // 0-100
}

export interface StudentAverageResult {
  studentId: string;
  subjects: SubjectAverage[];
  weightedAverage: number;   // moyenne générale pondérée (0-20)
  percentage: number;        // 0-100
  mention: string;
  passedSubjects: number;
  failedSubjects: number;
}

/**
 * Moyenne pondérée d'un élève pour une période.
 * Chaque matière compte pour son coefficient ; la note est ramenée /20
 * puis pondérée : Σ(note/20 × coef) / Σ(coef).
 */
export async function computeStudentAverage(
  schoolId: string,
  studentId: string,
  opts: { trimester?: string; period?: string; classId?: string }
): Promise<StudentAverageResult> {
  const grades = await db.grade.findMany({
    where: {
      schoolId,
      studentId,
      deletedAt: null,
      ...(opts.trimester ? { trimester: opts.trimester } : {}),
      ...(opts.period ? { period: opts.period } : {}),
      ...(opts.classId ? { course: { is: { classId: opts.classId } } } : {}),
    },
    include: {
      course: { select: { id: true, name: true, coefficient: true, maxScore: true, classId: true } },
    },
  });

  // Les coefficients configurés par l'administration priment sur le coefficient
  // historique du cours. Les notes conservent leur maximum réel (10/20/50/100).
  const coefficientsByCourse: Record<string, number> = {};
  const byClass = new Map<string, Array<{ id: string; coefficient: number }>>();
  for (const grade of grades) {
    const courseClassId = grade.course.classId;
    if (!courseClassId) continue;
    const items = byClass.get(courseClassId) ?? [];
    if (!items.some((item) => item.id === grade.courseId)) {
      items.push({ id: grade.courseId, coefficient: grade.course.coefficient || 1 });
      byClass.set(courseClassId, items);
    }
  }
  for (const [courseClassId, courses] of byClass) {
    const resolved = await resolveClassCoefficients(schoolId, courseClassId, courses);
    Object.assign(coefficientsByCourse, resolved.byCourse);
  }

  return calculateStudentAverageFromRows(studentId, grades.map((grade) => ({
    courseId: grade.courseId,
    courseName: grade.course.name,
    score: grade.score,
    maxScore: grade.maxScore || grade.course.maxScore || 20,
    coefficient: coefficientsByCourse[grade.courseId] ?? grade.course.coefficient ?? 1,
  })));
}

export interface ClassRankingRow {
  studentId: string;
  weightedAverage: number;
  percentage: number;
  rank: number;
}

/**
 * Rang de compétition (1 = meilleur) pour une classe/période.
 * Égalités de moyenne → même rang (classement dense simplifié).
 */
export async function computeClassRanking(
  schoolId: string,
  classId: string,
  opts: { trimester?: string; period?: string }
): Promise<ClassRankingRow[]> {
  const students = await db.user.findMany({
    where: { schoolId, role: 'STUDENT', deletedAt: null, classEnrollments: { some: { classId } } },
    select: { id: true },
  });

  const rows: ClassRankingRow[] = [];
  for (const s of students) {
    const res = await computeStudentAverage(schoolId, s.id, { ...opts, classId });
    rows.push({
      studentId: s.id,
      weightedAverage: res.weightedAverage,
      percentage: res.percentage,
      rank: 0,
    });
  }

  return rankAverageResults(rows);
}

/**
 * Décision RDC : réussi / rattrapage / éliminé, basée sur les seuils
 * configurables de l'école (GradingDecisionRule).
 */
export async function evaluateDecision(
  schoolId: string,
  classId: string,
  result: StudentAverageResult
): Promise<{ decision: 'ADMIS' | 'RATTRAPAGE' | 'ELIMINE'; threshold: number }> {
  const t = await getRdcThresholds(schoolId, classId);
  if (t.eliminationPercentage !== null && result.percentage < t.eliminationPercentage) {
    return { decision: 'ELIMINE', threshold: t.eliminationPercentage };
  }
  if (result.percentage >= t.passPercentage && result.failedSubjects <= t.maxFailedCourses) {
    return { decision: 'ADMIS', threshold: t.passPercentage };
  }
  if (result.percentage >= t.retakeMinPercentage) {
    return { decision: 'RATTRAPAGE', threshold: t.retakeMinPercentage };
  }
  return { decision: 'ELIMINE', threshold: t.retakeMinPercentage };
}

/**
 * Verrouillage des notes après date limite.
 * - Un `Period` marqué `isLocked` (ou `AcademicClosure` existant) interdit
 *   toute création/modification de note pour la période concernée.
 * Lève 423 Locked.
 */
export async function assertGradeWritable(
  schoolId: string,
  input: { period?: string; trimester?: string; evaluationDate?: Date }
): Promise<void> {
  // 1) Fermetures académiques existantes (scope=trimestre ou période).
  const closures = await db.academicClosure.findMany({
    where: { schoolId, scope: { in: ['TRIMESTRE', 'PERIOD', 'trimester', 'period'] } },
    select: { scope: true, key: true, closedAt: true },
  });
  if (closures.length > 0) {
    const keys = new Set(closures.map((c) => c.key));
    if (
      (input.trimester && keys.has(input.trimester)) ||
      (input.period && keys.has(input.period))
    ) {
      throw new ApiError(
        'Période clôturée : les notes ne sont plus modifiables (423).',
        423,
        'PERIOD_LOCKED'
      );
    }
  }
  // 2) Périodes explicites (Phase 3) : un period isLocked bloque.
  if (input.period) {
    const period = await db.period.findFirst({
      where: { schoolId, code: input.period, isLocked: true, deletedAt: null },
      select: { id: true },
    });
    if (period) {
      throw new ApiError('Période verrouillée : contactez l’administration.', 423, 'PERIOD_LOCKED');
    }
  }
  // 3) Date limite : pas de note dans le futur (> 1 jour de tolérance).
  if (input.evaluationDate && input.evaluationDate.getTime() > Date.now() + 24 * 3600 * 1000) {
    throw new ApiError('Date d’évaluation future interdite.', 400, 'FUTURE_DATE');
  }
}
