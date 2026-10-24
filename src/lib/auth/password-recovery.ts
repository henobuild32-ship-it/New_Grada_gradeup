import { db } from '@/lib/db';
import { isInviteCodeWellFormed, normalizeInviteCode } from '@/lib/code-format';

export interface PasswordRecoveryIdentity {
  email?: unknown;
  fullName?: unknown;
  inviteCode?: unknown;
  isAdminLogin?: unknown;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Resolve a recovery request to one active account without crossing schools. */
export async function findPasswordRecoveryUser(identity: PasswordRecoveryIdentity) {
  const email = cleanText(identity.email).toLowerCase();
  const fullName = cleanText(identity.fullName);
  const isAdminLogin = identity.isAdminLogin === true;

  if (isAdminLogin) {
    if (!email) return null;
    const admins = await db.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' }, role: 'ADMIN', active: true, deletedAt: null },
      include: { school: true },
      take: 2,
    });
    return admins.length === 1 ? admins[0] : null;
  }

  if (email) {
    const users = await db.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' }, role: { not: 'ADMIN' }, active: true, deletedAt: null },
      include: { school: true },
      take: 2,
    });
    return users.length === 1 ? users[0] : null;
  }

  if (!fullName) return null;
  const inviteCode = normalizeInviteCode(cleanText(identity.inviteCode));
  if (!isInviteCodeWellFormed(inviteCode)) return null;
  const school = await db.school.findUnique({ where: { inviteCode }, select: { id: true } });
  if (!school) return null;

  // A name is not a unique identifier. Only permit this recovery path when it
  // resolves to exactly one active account within the already identified school.
  const matches = await db.user.findMany({
    where: {
      schoolId: school.id,
      role: { not: 'ADMIN' },
      fullName: { equals: fullName, mode: 'insensitive' },
      active: true,
      deletedAt: null,
    },
    select: { id: true },
    take: 2,
  });
  if (matches.length !== 1) return null;
  return db.user.findUnique({ where: { id: matches[0].id }, include: { school: true } });
}

export function getRecoveryIdentityKey(identity: PasswordRecoveryIdentity): string {
  const email = cleanText(identity.email).toLowerCase();
  if (email) return `email:${email}`;
  const inviteCode = normalizeInviteCode(cleanText(identity.inviteCode));
  const fullName = cleanText(identity.fullName).toLocaleLowerCase();
  return `name:${inviteCode}:${fullName}`;
}
