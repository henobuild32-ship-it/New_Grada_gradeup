import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError, ApiError, assertFound } from '@/lib/api/errors';
import { list, created } from '@/lib/api/response';
import { installmentSchema, parseOrThrow } from '@/lib/validation/entities';
import { auditFromRequest } from '@/lib/api/audit';

export const runtime = 'nodejs';

/** GET /api/fees/[id]/installments?studentId=... — tranches d'un frais (optionnellement par élève). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, ['ADMIN', 'TEACHER']);
    const { id } = await params;
    const { searchParams } = new URL(req.url);

    const fee = assertFound(await db.fee.findUnique({ where: { id }, select: { id: true, schoolId: true } }), 'Frais introuvable.');
    assertSchool(auth, fee.schoolId);

    const where: any = { schoolId: auth.schoolId, feeId: id, deletedAt: null };
    const studentId = searchParams.get('studentId');
    if (studentId) where.studentId = studentId;

    const rows = await db.installment.findMany({ where, orderBy: { dueDate: 'asc' } });
    return list('installment', rows);
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * POST /api/fees/[id]/installments — crée les tranches d'un frais pour un élève.
 * Corps : soit un objet unique (installmentSchema), soit { installments: [...] }.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, ['ADMIN']);
    const { id } = await params;

    const fee = assertFound(await db.fee.findUnique({ where: { id } }), 'Frais introuvable.');
    assertSchool(auth, fee.schoolId);

    const body = await req.json();
    const items = Array.isArray(body?.installments) ? body.installments : [body];

    const createdRows: Awaited<ReturnType<typeof db.installment.create>>[] = [];
    for (const item of items) {
      const data = parseOrThrow(installmentSchema, item);
      if (data.feeId && data.feeId !== id) {
        throw new ApiError('feeId du corps différent de l’URL.', 400, 'BAD_REQUEST');
      }
      const student = await db.user.findFirst({
        where: { id: data.studentId, schoolId: auth.schoolId, role: 'STUDENT', deletedAt: null },
        select: { id: true, classEnrollments: { select: { classId: true } } },
      });
      if (!student) throw new ApiError('Élève introuvable dans l’établissement.', 404, 'NOT_FOUND');
      if (fee.classId && !student.classEnrollments.some((enrollment) => enrollment.classId === fee.classId)) {
        throw new ApiError('Les frais ne s’appliquent pas à la classe de cet élève.', 400, 'CLASS_MISMATCH');
      }
      const duplicate = await db.installment.findFirst({
        where: { schoolId: auth.schoolId, feeId: id, studentId: data.studentId, label: data.label, dueDate: data.dueDate, deletedAt: null },
        select: { id: true },
      });
      if (duplicate) throw new ApiError('Cette tranche existe déjà pour cet élève.', 409, 'DUPLICATE_INSTALLMENT');

      createdRows.push(
        await db.installment.create({
          data: {
            schoolId: auth.schoolId,
            feeId: id,
            studentId: data.studentId,
            label: data.label,
            amount: data.amount,
            currency: data.currency ?? fee.currency,
            dueDate: data.dueDate,
          },
        })
      );
      await auditFromRequest(req, {
        schoolId: auth.schoolId,
        userId: auth.userId,
        action: 'INSTALLMENT_CREATE',
        entity: 'Installment',
        entityId: createdRows[createdRows.length - 1].id,
        after: createdRows[createdRows.length - 1],
      });
    }

    return created('installment', createdRows);
  } catch (e) {
    return handleApiError(e);
  }
}
