import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError, assertFound } from '@/lib/api/errors';
import { ok } from '@/lib/api/response';
import { feeSchema, parseOrThrow } from '@/lib/validation/entities';
import { auditFromRequest } from '@/lib/api/audit';

export const runtime = 'nodejs';

async function loadFee(id: string) {
  return assertFound(await db.fee.findUnique({ where: { id }, include: { installments: true } }), 'Frais introuvable.');
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    const { id } = await params;
    const fee = await loadFee(id);
    assertSchool(auth, fee.schoolId);
    return ok('fee', fee);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, ['ADMIN']);
    const { id } = await params;
    const fee = assertFound(await db.fee.findUnique({ where: { id } }), 'Frais introuvable.');
    assertSchool(auth, fee.schoolId);

    const body = await req.json();
    const data = parseOrThrow(feeSchema, body);

    const updated = await db.fee.update({
      where: { id },
      data: {
        name: data.name,
        amount: data.amount,
        classId: data.classId || null,
        currency: data.currency ?? fee.currency,
        dueDate: data.dueDate ?? fee.dueDate,
        cycle: data.cycle ?? fee.cycle,
        isAnnual: data.isAnnual ?? fee.isAnnual,
      },
    });

    await auditFromRequest(req, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'UPDATE',
      entity: 'Fee',
      entityId: id,
      before: fee,
      after: updated,
    });

    return ok('fee', updated);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, ['ADMIN']);
    const { id } = await params;
    const fee = assertFound(await db.fee.findUnique({ where: { id } }), 'Frais introuvable.');
    assertSchool(auth, fee.schoolId);

    const deleted = await db.fee.update({ where: { id }, data: { deletedAt: new Date() } });

    await auditFromRequest(req, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'DELETE',
      entity: 'Fee',
      entityId: id,
      before: fee,
    });

    return ok('fee', deleted);
  } catch (e) {
    return handleApiError(e);
  }
}
