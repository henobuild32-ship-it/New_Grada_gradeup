import test from 'node:test';
import assert from 'node:assert/strict';
import {
  confidentialRole,
  decryptConfidentialCode,
  encryptConfidentialCode,
  generateConfidentialCode,
  hashConfidentialCode,
  verifyConfidentialCode,
} from '../../src/lib/confidential-access.ts';

test('codes are readable, use a high-entropy alphabet and avoid ambiguous characters', () => {
  const code = generateConfidentialCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/);
  assert.equal(new Set(code.replaceAll('-', '')).size > 7, true);
  assert.equal(/[01IO]/.test(code), false);
});

test('code verification is bound to both the school and the role', () => {
  const code = generateConfidentialCode();
  const hash = hashConfidentialCode('school-a', 'LECTEUR', code);
  assert.equal(verifyConfidentialCode('school-a', 'LECTEUR', code.toLowerCase(), hash), true);
  assert.equal(verifyConfidentialCode('school-b', 'LECTEUR', code, hash), false);
  assert.equal(verifyConfidentialCode('school-a', 'CAISSIER', code, hash), false);
  assert.equal(verifyConfidentialCode('school-a', 'LECTEUR', `${code}X`, hash), false);
});

test('administrator copy value is authenticated encryption and cannot be read from its stored form', () => {
  const code = generateConfidentialCode();
  const encrypted = encryptConfidentialCode(code);
  assert.notEqual(encrypted, code);
  assert.equal(decryptConfidentialCode(encrypted), code);
  const [iv, tag, ciphertext] = encrypted.split('.');
  assert.throws(() => decryptConfidentialCode(`${iv}.${tag}.${ciphertext.slice(0, -2)}AA`));
});

test('only the two confidentiality roles pass the server role guard', () => {
  assert.equal(confidentialRole('LECTEUR'), true);
  assert.equal(confidentialRole('CAISSIER'), true);
  assert.equal(confidentialRole('TEACHER'), false);
  assert.equal(confidentialRole('ADMIN'), false);
});
