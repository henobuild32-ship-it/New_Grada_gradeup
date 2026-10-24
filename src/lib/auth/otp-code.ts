import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_LENGTH = 6;

export function generateOtpCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
}

export function generateOtpSalt(): string {
  return randomBytes(16).toString('hex');
}

export function hashOtpCode(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

export function verifyOtpHash(code: string, salt: string, expectedHash: string): boolean {
  if (!/^\d{6}$/.test(code) || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const computed = Buffer.from(hashOtpCode(code, salt));
  const expected = Buffer.from(expectedHash);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}
