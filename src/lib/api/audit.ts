import { db } from '@/lib/db';

/**
 * AuditLog — enregistre TOUTES les actions sensibles :
 * notes, paiements, bulletins, comptes (création/édition/suppression/rôle).
 * Non bloquant : un échec d'audit ne doit jamais faire échouer l'action
 * métier (on logge côté serveur en parallèle).
 */
export type AuditAction =
  | 'CREATE' | 'UPDATE' | 'DELETE'
  | 'GRADE_VALIDATE' | 'GRADE_LOCK' | 'GRADE_MODIFY_REQUEST' | 'GRADE_MODIFY_APPROVE'
  | 'BULLETIN_VALIDATE_TITULAIRE' | 'BULLETIN_VALIDATE_ADMIN' | 'BULLETIN_PUBLISH'
  | 'PAYMENT_CREATE' | 'PAYMENT_UPDATE' | 'PAYMENT_DELETE'
  | 'USER_CREATE' | 'USER_UPDATE' | 'USER_DELETE' | 'USER_ROLE_CHANGE' | 'USER_DISABLE'
  | 'ATTENDANCE_JUSTIFY' | 'ATTENDANCE_REVIEW'
  | 'YEAR_CLOSE' | 'PERIOD_LOCK'
  | 'LOGIN' | 'LOGOUT' | 'PASSWORD_RESET';

export interface AuditEntry {
  schoolId: string;
  userId: string;
  action: AuditAction | string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

/** Insère une entrée d'audit. Jamais throw. */
export async function auditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        schoolId: entry.schoolId,
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? '',
        before: entry.before === undefined ? undefined : (entry.before as object),
        after: entry.after === undefined ? undefined : (entry.after as object),
        ip: entry.ip ?? '',
        userAgent: entry.userAgent ?? '',
      },
    });
  } catch (e) {
    console.error('[audit] échec enregistrement', entry.action, entry.entity, e instanceof Error ? e.message : e);
  }
}

/** Extrait IP + user-agent d'une requête Next. */
export function requestMeta(req: Request): { ip: string; userAgent: string } {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : (req.headers.get('x-real-ip') ?? '');
  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 300);
  return { ip, userAgent };
}

/** Helper pratique : audit depuis une route, en une ligne. */
export function auditFromRequest(
  req: Request,
  entry: Omit<AuditEntry, 'ip' | 'userAgent'>
): Promise<void> {
  const meta = requestMeta(req);
  return auditLog({ ...entry, ...meta });
}
