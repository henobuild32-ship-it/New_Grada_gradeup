import { randomInt } from 'node:crypto';

const READABLE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateReadableCode(prefix: 'ECOLE' | 'P', length = 6): string {
  let suffix = '';
  for (let index = 0; index < length; index += 1) {
    suffix += READABLE_CODE_ALPHABET[randomInt(READABLE_CODE_ALPHABET.length)];
  }
  return `${prefix}-${suffix}`;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: unknown }).code === 'P2002';
}
