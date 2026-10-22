import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError, ApiError, assertFound } from '@/lib/api/errors';
import { ok } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    const { id } = await params;

    const justification = assertFound(
      await db.absenceJustification.findUnique({ where: { id } }),
      'Justification introuvable.'
    );
    assertSchool(auth, justification.schoolId);

    const isOwner =
      justification.explainedById === auth.userId || justification.studentId === auth.userId;
    const isStaff = auth.role === 'ADMIN' || auth.role === 'TEACHER';
    if (!isOwner && !isStaff) {
      throw new ApiError('Accès refusé : réservé au propriétaire ou au personnel.', 403, 'OWNERSHIP_FORBIDDEN');
    }

    return ok('absenceJustification', justification);
  } catch (e) {
    return handleApiError(e);
  }
}
