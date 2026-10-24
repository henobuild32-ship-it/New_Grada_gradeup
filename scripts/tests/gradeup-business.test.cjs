/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateStudentAverageFromRows,
  getMention,
  rankAverageResults,
} = require('../../src/lib/business/average-calculations.ts');
const { canQueueOffline, computeBackoffMs } = require('../../src/lib/offline/sync-rules.ts');

test('moyenne pondérée normalise chaque note avec son maximum réel', () => {
  const result = calculateStudentAverageFromRows('student-1', [
    { courseId: 'math', courseName: 'Mathématiques', score: 50, maxScore: 100, coefficient: 1 },
    { courseId: 'math', courseName: 'Mathématiques', score: 10, maxScore: 20, coefficient: 1 },
    { courseId: 'fr', courseName: 'Français', score: 15, maxScore: 20, coefficient: 3 },
  ]);

  assert.equal(result.studentId, 'student-1');
  assert.equal(result.subjects.find((subject) => subject.courseId === 'math')?.average, 10);
  assert.equal(result.weightedAverage, 13.75);
  assert.equal(result.percentage, 68.75);
  assert.equal(result.mention, 'Assez bien');
  assert.equal(result.passedSubjects, 2);
  assert.equal(result.failedSubjects, 0);
});

test('moyenne invalide et coefficient non positif utilisent des valeurs de repli sûres', () => {
  const result = calculateStudentAverageFromRows('student-2', [
    { courseId: 'sci', courseName: 'Sciences', score: 8, maxScore: 0, coefficient: 0 },
    { courseId: 'sci', courseName: 'Sciences', score: Number.NaN, maxScore: 20, coefficient: 2 },
  ]);
  assert.equal(result.subjects.length, 1);
  assert.equal(result.subjects[0].average, 8);
  assert.equal(result.subjects[0].maxScore, 20);
  assert.equal(result.subjects[0].coefficient, 1);
});

test('mentions RDC respectent les seuils configurés dans la règle de base', () => {
  assert.equal(getMention(90), 'Excellent');
  assert.equal(getMention(80), 'Très bien');
  assert.equal(getMention(70), 'Bien');
  assert.equal(getMention(60), 'Assez bien');
  assert.equal(getMention(50), 'Passable');
  assert.equal(getMention(45), 'Insuffisant (rattrapage)');
  assert.equal(getMention(44.99), 'Faible');
});

test('classement utilise le rang de compétition pour les égalités', () => {
  const ranked = rankAverageResults([
    { studentId: 'a', weightedAverage: 12, percentage: 60 },
    { studentId: 'b', weightedAverage: 18, percentage: 90 },
    { studentId: 'c', weightedAverage: 18, percentage: 90 },
    { studentId: 'd', weightedAverage: 10, percentage: 50 },
  ]);
  assert.deepEqual(ranked.map((row) => [row.studentId, row.rank]), [
    ['b', 1], ['c', 1], ['a', 3], ['d', 4],
  ]);
});

test('backoff de synchronisation augmente puis reste plafonné à cinq minutes', () => {
  assert.equal(computeBackoffMs(0), 2_000);
  assert.equal(computeBackoffMs(1), 2_000);
  assert.equal(computeBackoffMs(2), 4_000);
  assert.equal(computeBackoffMs(8), 256_000);
  assert.equal(computeBackoffMs(9), 300_000);
  assert.equal(computeBackoffMs(Number.POSITIVE_INFINITY), 2_000);
});

test('les opérations marquées online-only ne peuvent pas être mises en file locale', () => {
  assert.equal(canQueueOffline(false), true);
  assert.equal(canQueueOffline(true), false);
});
