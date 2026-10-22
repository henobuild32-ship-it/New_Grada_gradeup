import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError, ApiError, assertFound } from '@/lib/api/errors';
import { ok } from '@/lib/api/response';
import { periodSchema, parseOrThrow } from '@/lib/validation/entities';
export const runtime = 'nodejs';

async function loadPeriod(id: string) {
  return assertFound(await db.period.findUnique({ where: { id } }), 'Période introuvable.');
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    const { id } = await params;
    const period = await loadPeriod(id);
    assertSchool(auth, period.schoolId);
    return ok('period', period);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, ['ADMIN']);
    const { id } = await params;
    const period = await loadPeriod(id);
    assertSchool(auth, period.schoolId);

    const body = await req.json();

    // Support toggle rapide de verrouillage (isLocked)
    if (body.isLocked !== undefined && Object.keys(body).length <= 3) {
      const updated = await db.period.update({
        where: { id },
        data: {
          isLocked: Boolean(body.isLocked),
          ...(body.status !== undefined && { status: String(body.status) }),
        },
      });
      return ok('period', updated);
    }

    const data = parseOrThrow(periodSchema, body);

    if (data.code && data.code !== period.code) {
      const dup = await db.period.findFirst({
        where: { schoolId: auth.schoolId, code: data.code, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (dup) throw new ApiError('Une période avec ce code existe déjà dans l’établissement.', 409, 'CONFLICT');
    }

    const updated = await db.period.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code,
        trimester: data.trimester ?? 1,
        semester: data.semester ?? null,
        startDate: data.startDate,
        endDate: data.endDate,
        schoolYearId: data.schoolYearId || '',
        ...(body.isLocked !== undefined && { isLocked: Boolean(body.isLocked) }),
        ...(body.status !== undefined && { status: String(body.status) }),
      },
    });

    return ok('period', updated);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, ['ADMIN']);
    const { id } = await params;
    const period = await loadPeriod(id);
    assertSchool(auth, period.schoolId);

    const deleted = await db.period.update({ where: { id }, data: { deletedAt: new Date() } });
    return ok('period', deleted);
  } catch (e) {
    return handleApiError(e);
  }
}
