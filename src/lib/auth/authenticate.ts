import { NextRequest } from 'next/server';
import { verifyAccessToken, ACCESS_COOKIE } from './jwt';
import { db } from '@/lib/db';

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.status = status;
    this.name = 'AuthError';
  }
}

export interface AuthUser {
  userId: string;
  schoolId: string;
  role: string;
  name: string;
  authVersion?: number;
}

export async function authenticateRequest(req: NextRequest): Promise<AuthUser> {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) throw new AuthError('Non authentifié. Veuillez vous connecter.', 401);

  const claims = verifyAccessToken(token);
  if (!claims) throw new AuthError('Session expirée ou invalide. Veuillez vous reconnecter.', 401);

  let role = claims.role;
  let schoolId = claims.schoolId;
  let userId = claims.sub;
  let name = claims.name;
  let authVersion = claims.authVersion;
  const confidentialRole = claims.role === 'LECTEUR' || claims.role === 'CAISSIER';
  if (confidentialRole) {
    const user = await db.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, schoolId: true, role: true, fullName: true, active: true, deletedAt: true, authVersion: true, lastActivityAt: true },
    });
    if (!user || !user.active || user.deletedAt) throw new AuthError('Compte désactivé ou supprimé. Veuillez contacter l’administrateur.', 403);
    if ((claims.authVersion ?? 0) !== (user.authVersion ?? 0)) throw new AuthError('Session révoquée. Veuillez vous reconnecter.', 401);
    if (claims.schoolId !== user.schoolId || claims.role !== user.role) throw new AuthError('Session invalide.', 401);
    role = user.role;
    schoolId = user.schoolId;
    userId = user.id;
    name = user.fullName;
    authVersion = user.authVersion;

    if (!user.lastActivityAt || user.lastActivityAt.getTime() < Date.now() - 2 * 60 * 1000) {
      void db.user.updateMany({
        where: {
          id: user.id,
          active: true,
          authVersion: user.authVersion,
          OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: new Date(Date.now() - 2 * 60 * 1000) } }],
        },
        data: { lastActivityAt: new Date() },
      }).catch(() => undefined);
    }
  }

  // Le Lecteur peut consulter les modules de son école, sans modifier les
  // données. La seule écriture autorisée est un message destiné à la direction.
  if (role === 'LECTEUR') {
    const path = new URL(req.url).pathname;
    const isReadOnly = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
    const mayContactAdmin = req.method === 'POST' && (path === '/api/reader/messages' || path === '/api/upload/message');
    if (!isReadOnly && !mayContactAdmin) {
      throw new AuthError('Le Lecteur ne peut pas modifier les données. Il peut uniquement écrire à l’administrateur.', 403);
    }
  }

  return {
    userId,
    schoolId,
    role,
    name,
    authVersion,
  };
}

/**
 * Comme authenticateRequest, mais vérifie en base que le compte est toujours actif.
 * Utiliser dans les routes sensibles (admin, finances, etc.).
 */
export async function authenticateRequestActive(req: NextRequest): Promise<AuthUser> {
  const auth = await authenticateRequest(req);
  if (auth.role === 'LECTEUR' || auth.role === 'CAISSIER') return auth;
  const user = await db.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, active: true, authVersion: true, deletedAt: true },
  });
  if (!user || !user.active || user.deletedAt) throw new AuthError('Compte désactivé ou supprimé. Veuillez contacter l’administrateur.', 403);
  if ((auth.authVersion ?? 0) !== (user.authVersion ?? 0)) throw new AuthError('Session révoquée. Veuillez vous reconnecter.', 401);
  return auth;
}
