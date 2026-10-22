import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/errors';
import { getRdcThresholds } from './rules';

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

/** Mention RDC (français). */
export function getMention(percentage: number): string {
  if (percentage >= 90) return 'Excellent';
  if (percentage >= 80) return 'Très bien';
  if (percentage >= 70) return 'Bien';
  if (percentage >= 60) return 'Assez bien';
  if (percentage >= 50) return 'Passable';
  if (percentage >= 45) return 'Insuffisant (rattrapage)';
  return 'Faible';
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
      ...(opts.classId ? {} : {}),
    },
    include: {
      course: { select: { id: true, name: true, coefficient: true, maxScore: true, classId: true } },
    },
  });

  // Regrouper par matière.
  const byCourse = new Map<string, { scores: number[]; maxScore: number; coefficient: number; name: string }>();
  for (const g of grades) {
    const key = g.courseId;
    const entry = byCourse.get(key) ?? {
      scores: [],
      maxScore: g.maxScore || g.course.maxScore || 20,
      coefficient: g.course.coefficient || 1,
      name: g.course.name,
    };
    entry.scores.push(g.score);
    byCourse.set(key, entry);
  }

  const subjects: SubjectAverage[] = [];
  let weightedSum = 0;
  let coefSum = 0;
  let passed = 0;
  let failed = 0;

  for (const [courseId, entry] of byCourse) {
    if (entry.scores.length === 0) continue;
    const avgRaw = entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length;
    const ratio = entry.maxScore > 0 ? avgRaw / entry.maxScore : 0;
    const avg20 = ratio * 20;
    subjects.push({
      courseId,
      courseName: entry.name,
      coefficient: entry.coefficient,
      average: Math.round(avg20 * 100) / 100,
      maxScore: entry.maxScore,
      percentage: Math.round(ratio * 10000) / 100,
    });
    weightedSum += avg20 * entry.coefficient;
    coefSum += entry.coefficient;
    if (ratio >= 0.5) passed += 1;
    else failed += 1;
  }

  const weightedAverage = coefSum > 0 ? weightedSum / coefSum : 0;
  const percentage = (weightedAverage / 20) * 100;

  return {
    studentId,
    subjects,
    weightedAverage: Math.round(weightedAverage * 100) / 100,
    percentage: Math.round(percentage * 100) / 100,
    mention: getMention(percentage),
    passedSubjects: passed,
    failedSubjects: failed,
  };
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

  rows.sort((a, b) => b.weightedAverage - a.weightedAverage);
  let lastAvg: number | null = null;
  let lastRank = 0;
  rows.forEach((row, i) => {
    if (lastAvg === null || row.weightedAverage < lastAvg) {
      lastRank = i + 1;
      lastAvg = row.weightedAverage;
    }
    row.rank = lastRank;
  });
  return rows;
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
