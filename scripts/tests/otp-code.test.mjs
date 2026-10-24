import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOtpCode,
  generateOtpSalt,
  hashOtpCode,
  verifyOtpHash,
} from '../../src/lib/auth/otp-code.ts';

test('OTP codes are exactly six digits, including possible leading zeroes', () => {
  for (let index = 0; index < 500; index += 1) {
    assert.match(generateOtpCode(), /^\d{6}$/);
  }
});

test('OTP hash is salted, verifies the exact code, and rejects malformed or wrong codes', () => {
  const code = '004281';
  const saltA = generateOtpSalt();
  const saltB = generateOtpSalt();
  const hashA = hashOtpCode(code, saltA);

  assert.equal(hashA.includes(code), false);
  assert.notEqual(hashA, hashOtpCode(code, saltB));
  assert.equal(verifyOtpHash(code, saltA, hashA), true);
  assert.equal(verifyOtpHash('004280', saltA, hashA), false);
  assert.equal(verifyOtpHash('4281', saltA, hashA), false);
});
