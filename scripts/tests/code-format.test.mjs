import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isInviteCodeWellFormed,
  isStudentCodeWellFormed,
  normalizeInviteCode,
  normalizeStudentCode,
} from '../../src/lib/code-format.ts';
import { generateReadableCode } from '../../src/lib/code-generation.ts';

test('school codes normalize case, spaces, extra hyphens, and pasted suffixes', () => {
  assert.equal(normalizeInviteCode('  eCoLe - ab c-def '), 'ECOLE-ABCDEF');
  assert.equal(normalizeInviteCode('abcdef'), 'ECOLE-ABCDEF');
  assert.equal(normalizeInviteCode('   '), '');
  assert.equal(isInviteCodeWellFormed(normalizeInviteCode('ecole - abcdef')), true);
  assert.equal(isInviteCodeWellFormed(normalizeInviteCode('ECOLE-ABCDE')), false);
});

test('student codes normalize case, spaces, extra hyphens, and pasted suffixes', () => {
  assert.equal(normalizeStudentCode(' p - ab c-def '), 'P-ABCDEF');
  assert.equal(normalizeStudentCode('abcdef'), 'P-ABCDEF');
  assert.equal(normalizeStudentCode('   '), '');
  assert.equal(isStudentCodeWellFormed(normalizeStudentCode('p-abcdef')), true);
  assert.equal(isStudentCodeWellFormed(normalizeStudentCode('P-ABCDE')), false);
});

test('new school and student codes use the readable alphabet and preserve existing prefixes', () => {
  for (let index = 0; index < 200; index += 1) {
    const schoolCode = generateReadableCode('ECOLE');
    const studentCode = generateReadableCode('P');
    assert.match(schoolCode, /^ECOLE-[A-HJ-KM-NP-Z2-9]{6}$/);
    assert.match(studentCode, /^P-[A-HJ-KM-NP-Z2-9]{6}$/);
    assert.equal(/[01OIL]/.test(schoolCode.slice(6)), false);
    assert.equal(/[01OIL]/.test(studentCode.slice(2)), false);
  }
});
