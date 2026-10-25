import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Prisma as PrismaClientTypes } from '@prisma/client';

export const CONFIDENTIAL_ROLES = ['LECTEUR', 'CAISSIER'] as const;
export type ConfidentialRole = (typeof CONFIDENTIAL_ROLES)[number];
export const CONFIDENTIAL_CODE_INVALID = "Ce code n'est pas valide ou a expiré. Demandez le code actuel à l'administrateur.";
export const CONFIDENTIAL_CODE_FULL = "Le nombre maximum de comptes est atteint pour ce rôle. Contactez l'administrateur de l'école.";
export const CONFIDENTIAL_CODE_RATE_LIMIT = 'Trop de tentatives. Réessayez plus tard.';
export const CONFIDENTIAL_CODE_TTL_MS = 24 * 60 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type TransactionClient = Omit<PrismaClientTypes.TransactionClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

function secret(): string {
  const value = process.env.CONFIDENTIAL_CODE_SECRET || process.env.JWT_SECRET;
  if (!value && process.env.NODE_ENV === 'production') throw new Error('La clé de chiffrement des codes confidentiels doit être configurée.');
  return value || 'gradeup-local-confidential-code-secret';
}

export function normalizeConfidentialCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function generateConfidentialCode(): string {
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]);
  const raw = chars.join('');
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function digest(schoolId: string, role: ConfidentialRole, code: string): string {
  return createHmac('sha256', `${secret()}:code-hash:v1`)
    .update(`${schoolId}\0${role}\0${normalizeConfidentialCode(code)}`)
    .digest('hex');
}

export function hashConfidentialCode(schoolId: string, role: ConfidentialRole, code: string): string {
  return digest(schoolId, role, code);
}

export function verifyConfidentialCode(schoolId: string, role: ConfidentialRole, code: string, expectedHash: string): boolean {
  const actual = Buffer.from(digest(schoolId, role, code), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function encryptionKey(): Buffer {
  return createHash('sha256').update('GradeUp confidential code encryption v1\0').update(secret()).digest();
}

export function encryptConfidentialCode(code: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptConfidentialCode(value: string): string {
  const [ivText, tagText, ciphertextText] = value.split('.');
  if (!ivText || !tagText || !ciphertextText) throw new Error('Code confidentiel illisible.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8');
}

export async function lockConfidentialCode(
  tx: TransactionClient,
  schoolId: string,
  role: ConfidentialRole,
  now = new Date(),
) {
  const existing = await tx.confidentialAccessCode.findUnique({ where: { schoolId_role: { schoolId, role } } });
  const initialCode = generateConfidentialCode();
  await tx.confidentialAccessCode.upsert({
    where: { schoolId_role: { schoolId, role } },
    update: {},
    create: {
      schoolId,
      role,
      codeHash: hashConfidentialCode(schoolId, role, initialCode),
      encryptedCode: encryptConfidentialCode(initialCode),
      issuedAt: now,
      rotateAt: new Date(now.getTime() + CONFIDENTIAL_CODE_TTL_MS),
    },
  });

  const state = await tx.confidentialAccessCode.findUniqueOrThrow({ where: { schoolId_role: { schoolId, role } } });
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "ConfidentialAccessCode" WHERE "id" = ${state.id} FOR UPDATE`);
  let locked = await tx.confidentialAccessCode.findUniqueOrThrow({ where: { id: state.id } });

  if (!existing) {
    const admin = await tx.user.findFirst({ where: { schoolId, role: 'ADMIN' }, select: { id: true } });
    if (admin) await tx.auditLog.create({
      data: {
        schoolId,
        userId: admin.id,
        action: 'CONFIDENTIAL_CODE_CREATED',
        entity: 'ConfidentialAccessCode',
        entityId: role,
        after: { role, generation: locked.generation },
      },
    });
  }

  // Safely grandfather pre-existing active cashier accounts. They occupy the
  // first generation's places and force a reset when the two-place limit is met.
  await tx.user.updateMany({
    where: { schoolId, role, active: true, deletedAt: null, confidentialCodeGeneration: null },
    data: { confidentialCodeGeneration: locked.generation },
  });
  const count = await tx.user.count({ where: { schoolId, role, active: true, deletedAt: null, confidentialCodeGeneration: locked.generation } });
  if (count >= 2 && !locked.suspendedAt) {
    locked = await tx.confidentialAccessCode.update({ where: { id: locked.id }, data: { suspendedAt: now } });
  }
  if (locked.rotateAt <= now && !locked.suspendedAt && count < 2) {
    const nextCode = generateConfidentialCode();
    locked = await tx.confidentialAccessCode.update({
      where: { id: locked.id },
      data: {
        codeHash: hashConfidentialCode(schoolId, role, nextCode),
        encryptedCode: encryptConfidentialCode(nextCode),
        issuedAt: now,
        rotateAt: new Date(now.getTime() + CONFIDENTIAL_CODE_TTL_MS),
      },
    });
    const admin = await tx.user.findFirst({ where: { schoolId, role: 'ADMIN' }, select: { id: true } });
    if (admin) await tx.auditLog.create({
      data: {
        schoolId,
        userId: admin.id,
        action: 'CONFIDENTIAL_CODE_ROTATED',
        entity: 'ConfidentialAccessCode',
        entityId: role,
        before: { role, generation: locked.generation, issuedAt: new Date(locked.issuedAt.getTime() - CONFIDENTIAL_CODE_TTL_MS).toISOString() },
        after: { role, generation: locked.generation },
      },
    });
  }
  return locked;
}

export type ConfidentialRegistrationResult =
  | { error: 'INVALID' | 'FULL' | 'DUPLICATE' }
  | { user: any; generation: number; total: number };

export async function registerConfidentialUser(
  tx: TransactionClient,
  input: {
    schoolId: string;
    role: ConfidentialRole;
    code: string;
    fullName: string;
    email: string;
    passwordHash: string;
    parentCode: string;
    gender: 'M' | 'F';
    now?: Date;
  },
): Promise<ConfidentialRegistrationResult> {
  const now = input.now || new Date();
  // A school-level lock makes the duplicate-email check atomic across the two
  // independent role codes, while each capacity remains role-specific.
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "School" WHERE "id" = ${input.schoolId} FOR UPDATE`);
  const codeState = await lockConfidentialCode(tx, input.schoolId, input.role, now);
  if (!verifyConfidentialCode(input.schoolId, input.role, input.code, codeState.codeHash)) return { error: 'INVALID' };

  const duplicateName = await tx.user.findFirst({
    where: { schoolId: input.schoolId, role: input.role, active: true, deletedAt: null, fullName: { equals: input.fullName, mode: 'insensitive' } },
    select: { id: true },
  });
  if (duplicateName) return { error: 'DUPLICATE' };
  if (input.email) {
    const duplicateEmail = await tx.user.findFirst({
      where: { schoolId: input.schoolId, email: { equals: input.email, mode: 'insensitive' }, active: true, deletedAt: null },
      select: { id: true },
    });
    if (duplicateEmail) return { error: 'DUPLICATE' };
  }

  const occupied = await tx.user.count({
    where: { schoolId: input.schoolId, role: input.role, active: true, deletedAt: null, confidentialCodeGeneration: codeState.generation },
  });
  if (codeState.suspendedAt || occupied >= 2) return { error: 'FULL' };

  const user = await tx.user.create({
    data: {
      schoolId: input.schoolId,
      fullName: input.fullName,
      email: input.email,
      password: input.passwordHash,
      role: input.role,
      parentCode: input.parentCode,
      gender: input.gender,
      active: true,
      confidentialCodeGeneration: codeState.generation,
      lastActivityAt: now,
    },
    include: { school: true, classEnrollments: { include: { class: true } }, children: true },
  });
  const total = occupied + 1;
  if (total >= 2) {
    await tx.confidentialAccessCode.update({ where: { id: codeState.id }, data: { suspendedAt: now } });
  }
  await tx.auditLog.create({
    data: {
      schoolId: input.schoolId,
      userId: user.id,
      action: 'CONFIDENTIAL_CODE_REGISTERED',
      entity: 'ConfidentialAccessCode',
      entityId: input.role,
      after: { role: input.role, generation: codeState.generation },
    },
  });
  return { user, generation: codeState.generation, total };
}

export function confidentialRole(value: unknown): value is ConfidentialRole {
  return value === 'LECTEUR' || value === 'CAISSIER';
}
