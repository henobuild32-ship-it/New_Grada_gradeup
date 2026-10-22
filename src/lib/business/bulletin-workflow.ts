import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/errors';
import type { AuthUser } from '@/lib/auth/authenticate';
import { auditFromRequest } from '@/lib/api/audit';
import { computeStudentAverage, computeClassRanking, evaluateDecision, getMention } from './average-service';

/**
 * Workflow de bulletin à DOUBLE VALIDATION (Phase 3) :
 *
 *   DRAFT → (titulaire) PENDING_TITULAIRE → VALIDATED_TITULAIRE
 *         → (admin)     PENDING_ADMIN     → VALIDATED_ADMIN
 *         → (admin)     PUBLISHED         (irréversible sans réouverture admin)
 *
 * Chaque transition est contrôlée par rôle + ownership :
 *  - titulaire : doit être titulaire de la classe
 *  - admin     : établissement courant uniquement
 * Écriture transactionnelle : bulletin + GradeSnapshot + AuditLog.
 */

type Action = 'submit' | 'validate_titulaire' | 'validate_admin' | 'publish' | 'reopen';

/** Statuts autorisés par le modèle Prisma (enum BulletinStatus). */
type BulletinStatusValue = 'DRAFT' | 'PENDING_TITULAIRE' | 'VALIDATED_TITULAIRE' | 'PENDING_ADMIN' | 'VALIDATED_ADMIN' | 'PUBLISHED';

interface TransitionTable {
  [status: string]: Partial<Record<Action, BulletinStatusValue>>;
}

const TRANSITIONS: TransitionTable = {
  DRAFT: { submit: 'PENDING_TITULAIRE' },
  PENDING_TITULAIRE: { validate_titulaire: 'VALIDATED_TITULAIRE', reopen: 'DRAFT' },
  VALIDATED_TITULAIRE: { submit: 'PENDING_ADMIN' },
  PENDING_ADMIN: { validate_admin: 'VALIDATED_ADMIN', reopen: 'VALIDATED_TITULAIRE' },
  VALIDATED_ADMIN: { publish: 'PUBLISHED' },
  PUBLISHED: { reopen: 'VALIDATED_ADMIN' },
};

export interface BulletinTransitionResult {
  id: string;
  status: string;
  average: number;
  rank: number | null;
  mention: string;
}

/**
 * Applique une transition de statut de bulletin.
 * @param req  requête (pour l'audit : IP + user-agent)
 * @param auth session
 * @param bulletinId cible
 * @param action action demandée
 * @param appreciation appréciation facultative (saisie titulaire/admin)
 */
export async function applyBulletinTransition(
  req: Request,
  auth: AuthUser,
  bulletinId: string,
  action: Action,
  appreciation?: string
): Promise<BulletinTransitionResult> {
  const bulletin = await db.bulletin.findUnique({ where: { id: bulletinId } });
  if (!bulletin || bulletin.deletedAt) throw new ApiError('Bulletin introuvable.', 404);
  if (bulletin.schoolId !== auth.schoolId) {
    throw new ApiError('Bulletin d’un autre établissement.', 403, 'TENANT_FORBIDDEN');
  }

  const allowed = TRANSITIONS[bulletin.status]?.[action];
  if (!allowed) {
    throw new ApiError(
      `Transition interdite : ${bulletin.status} → ${action}.`,
      409,
      'INVALID_TRANSITION'
    );
  }

  // --- Contrôles de rôle / ownership -------------------
  if (action === 'submit') {
    // Titulaire de la classe ou admin peut soumettre.
    if (auth.role === 'TEACHER') {
      const klass = await db.schoolClass.findUnique({ where: { id: bulletin.classId } });
      if (klass?.titulaireId !== auth.userId) {
        throw new ApiError('Seul le titulaire de la classe peut soumettre.', 403, 'OWNERSHIP_FORBIDDEN');
      }
    } else if (auth.role !== 'ADMIN') {
      throw new ApiError('Rôle insuffisant pour soumettre un bulletin.', 403, 'ROLE_FORBIDDEN');
    }
  }
  if (action === 'validate_titulaire') {
    if (auth.role !== 'ADMIN' && auth.role !== 'TEACHER') {
      throw new ApiError('Validation titulaire réservée (titulaire/admin).', 403, 'ROLE_FORBIDDEN');
    }
    if (auth.role === 'TEACHER') {
      const klass = await db.schoolClass.findUnique({ where: { id: bulletin.classId } });
      if (klass?.titulaireId !== auth.userId) {
        throw new ApiError('Seul le titulaire de la classe peut valider.', 403, 'OWNERSHIP_FORBIDDEN');
      }
    }
  }
  if (action === 'validate_admin' || action === 'publish' || action === 'reopen') {
    if (auth.role !== 'ADMIN') {
      throw new ApiError('Réservé à l’administration.', 403, 'ROLE_FORBIDDEN');
    }
  }

  // --- Recalcul des valeurs au moment de la validation ---
  const ranking = await computeClassRanking(auth.schoolId, bulletin.classId, {
    trimester: String(bulletin.term),
    period: undefined,
  });
  const me = ranking.find((r) => r.studentId === bulletin.studentId);
  const avg = await computeStudentAverage(auth.schoolId, bulletin.studentId, {
    trimester: String(bulletin.term),
    classId: bulletin.classId,
  });
  const decision = await evaluateDecision(auth.schoolId, bulletin.classId, avg);
  const rank = me?.rank ?? bulletin.rank ?? null;
  const mention = avg.mention || getMention(avg.percentage);

  const isPublish = action === 'publish';
  const now = new Date();

  const updated = await db.$transaction(async (tx) => {
    const next = await tx.bulletin.update({
      where: { id: bulletinId },
      data: {
        status: allowed,
        average: avg.weightedAverage,
        rank,
        mention,
        appreciation: appreciation ?? bulletin.appreciation,
        ...(action === 'validate_titulaire'
          ? { validatedByTitulaireId: auth.userId, validatedAt: now }
          : {}),
        ...(action === 'validate_admin'
          ? { validatedByAdminId: auth.userId, validatedAt: now }
          : {}),
        ...(isPublish ? { publishedAt: now, validatedByAdminId: auth.userId } : {}),
        version: { increment: 1 },
      },
    });

    // Snapshot des notes à la publication (trace officielle).
    if (isPublish) {
      const grades = await tx.grade.findMany({
        where: { schoolId: auth.schoolId, studentId: bulletin.studentId, trimester: String(bulletin.term), deletedAt: null },
        include: { course: { select: { id: true, coefficient: true, maxScore: true } } },
      });
      for (const g of grades) {
        await tx.gradeSnapshot.create({
          data: {
            schoolId: auth.schoolId,
            studentId: bulletin.studentId,
            courseId: g.courseId,
            period: g.period,
            trimester: g.trimester,
            score: g.score,
            maxScore: g.maxScore,
            coefficient: g.course.coefficient,
            sourceGradeId: g.id,
          },
        });
      }
    }

    // AuditLog transactionnel (si la table existe déjà en base).
    try {
      await tx.auditLog.create({
        data: {
          schoolId: auth.schoolId,
          userId: auth.userId,
          action: `BULLETIN_${action.toUpperCase()}`,
          entity: 'Bulletin',
          entityId: bulletinId,
          before: { status: bulletin.status, average: bulletin.average, rank: bulletin.rank },
          after: { status: allowed, average: avg.weightedAverage, rank, mention },
        },
      });
    } catch {
      /* table non migrée : l'audit best-effort ne bloque pas */
    }

    return next;
  });

  // Audit hors transaction (IP/user-agent) — best effort.
  await auditFromRequest(req, {
    schoolId: auth.schoolId,
    userId: auth.userId,
    action: `BULLETIN_${action.toUpperCase()}`,
    entity: 'Bulletin',
    entityId: bulletinId,
    before: { status: bulletin.status },
    after: { status: allowed },
  });

  return {
    id: updated.id,
    status: updated.status,
    average: updated.average,
    rank: updated.rank,
    mention: updated.mention,
  };
}

/** Batch : soumettre/tout valider pour une classe + terme. */
export async function bulkBulletinTransition(
  req: Request,
  auth: AuthUser,
  classId: string,
  term: number,
  academicYear: string,
  action: Action
): Promise<{ succeeded: number; failed: { id: string; error: string }[] }> {
  const bulletins = await db.bulletin.findMany({
    where: { schoolId: auth.schoolId, classId, term, academicYear, deletedAt: null },
    select: { id: true },
  });
  const failed: { id: string; error: string }[] = [];
  let succeeded = 0;
  for (const b of bulletins) {
    try {
      await applyBulletinTransition(req, auth, b.id, action);
      succeeded += 1;
    } catch (e) {
      failed.push({ id: b.id, error: e instanceof Error ? e.message : 'Erreur' });
    }
  }
  return { succeeded, failed };
}
