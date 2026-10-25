import { db } from '@/lib/db';

export interface PasswordRecoveryIdentity {
  email?: unknown;
  isAdminLogin?: unknown;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Resolve a recovery request to one active account without crossing schools. */
export async function findPasswordRecoveryUser(identity: PasswordRecoveryIdentity) {
  const email = cleanText(identity.email).toLowerCase();
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

  return null;
}

export function getRecoveryIdentityKey(identity: PasswordRecoveryIdentity): string {
  const email = cleanText(identity.email).toLowerCase();
  return `email:${email}`;
}
