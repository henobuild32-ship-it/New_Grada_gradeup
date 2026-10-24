export interface AverageInputRow {
  courseId: string;
  courseName: string;
  score: number;
  maxScore: number;
  coefficient: number;
}

export interface SubjectAverageResult {
  courseId: string;
  courseName: string;
  coefficient: number;
  average: number;
  maxScore: number;
  percentage: number;
}

export interface StudentAverageCalculation {
  studentId: string;
  subjects: SubjectAverageResult[];
  weightedAverage: number;
  percentage: number;
  mention: string;
  passedSubjects: number;
  failedSubjects: number;
}

/** Mention RDC à partir du pourcentage obtenu. */
export function getMention(percentage: number): string {
  if (percentage >= 90) return 'Excellent';
  if (percentage >= 80) return 'Très bien';
  if (percentage >= 70) return 'Bien';
  if (percentage >= 60) return 'Assez bien';
  if (percentage >= 50) return 'Passable';
  if (percentage >= 45) return 'Insuffisant (rattrapage)';
  return 'Faible';
}

/** Calcul déterministe des moyennes depuis des notes normalisées en base. */
export function calculateStudentAverageFromRows(
  studentId: string,
  rows: AverageInputRow[]
): StudentAverageCalculation {
  const byCourse = new Map<string, { scoresOnTwenty: number[]; coefficient: number; name: string }>();
  for (const row of rows) {
    if (!Number.isFinite(row.score)) continue;
    const maxScore = Number.isFinite(row.maxScore) && row.maxScore > 0 ? row.maxScore : 20;
    const coefficient = Number.isFinite(row.coefficient) && row.coefficient > 0 ? row.coefficient : 1;
    const entry = byCourse.get(row.courseId) ?? { scoresOnTwenty: [], coefficient, name: row.courseName };
    entry.scoresOnTwenty.push((row.score / maxScore) * 20);
    byCourse.set(row.courseId, entry);
  }

  const subjects: SubjectAverageResult[] = [];
  let weightedSum = 0;
  let coefficientSum = 0;
  let passedSubjects = 0;
  let failedSubjects = 0;

  for (const [courseId, entry] of byCourse) {
    if (!entry.scoresOnTwenty.length) continue;
    const average = entry.scoresOnTwenty.reduce((sum, score) => sum + score, 0) / entry.scoresOnTwenty.length;
    const ratio = average / 20;
    subjects.push({
      courseId,
      courseName: entry.name,
      coefficient: entry.coefficient,
      average: Math.round(average * 100) / 100,
      maxScore: 20,
      percentage: Math.round(ratio * 10_000) / 100,
    });
    weightedSum += average * entry.coefficient;
    coefficientSum += entry.coefficient;
    if (ratio >= 0.5) passedSubjects += 1;
    else failedSubjects += 1;
  }

  const weightedAverage = coefficientSum > 0 ? weightedSum / coefficientSum : 0;
  const percentage = (weightedAverage / 20) * 100;
  return {
    studentId,
    subjects,
    weightedAverage: Math.round(weightedAverage * 100) / 100,
    percentage: Math.round(percentage * 100) / 100,
    mention: getMention(percentage),
    passedSubjects,
    failedSubjects,
  };
}

export interface RankingInput {
  studentId: string;
  weightedAverage: number;
  percentage: number;
}

/** Rang de compétition: une égalité conserve le même rang, la suivante saute. */
export function rankAverageResults(rows: RankingInput[]) {
  const ranked = rows.map((row) => ({ ...row, rank: 0 })).sort((a, b) => b.weightedAverage - a.weightedAverage);
  let lastAverage: number | null = null;
  let lastRank = 0;
  ranked.forEach((row, index) => {
    if (lastAverage === null || row.weightedAverage < lastAverage) {
      lastRank = index + 1;
      lastAverage = row.weightedAverage;
    }
    row.rank = lastRank;
  });
  return ranked;
}
