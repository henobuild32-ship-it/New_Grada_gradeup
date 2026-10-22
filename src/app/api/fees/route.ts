import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';
import { parseListParams, list, created } from '@/lib/api/response';
import { feeSchema, parseOrThrow } from '@/lib/validation/entities';
import { auditFromRequest } from '@/lib/api/audit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const pagination = parseListParams(searchParams);

    const where: any = { schoolId: auth.schoolId, deletedAt: null };
    const classId = searchParams.get('classId');
    if (classId) where.classId = classId;

    const [total, rows] = await Promise.all([
      db.fee.count({ where }),
      db.fee.findMany({
        where,
        orderBy: pagination.orderBy,
        skip: pagination.skip,
        take: pagination.take,
        include: { installments: { select: { id: true, status: true, amount: true, studentId: true } } },
      }),
    ]);

    return list('fee', rows, { page: pagination.page, pageSize: pagination.pageSize, total, totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['ADMIN']);
    const body = await req.json();
    const data = parseOrThrow(feeSchema, body);

    const fee = await db.fee.create({
      data: {
        schoolId: auth.schoolId,
        classId: data.classId || null,
        name: data.name,
        amount: data.amount,
        currency: data.currency ?? 'USD',
        dueDate: data.dueDate || '',
        cycle: data.cycle || 'ALL',
        isAnnual: data.isAnnual ?? true,
      },
    });

    await auditFromRequest(req, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'CREATE',
      entity: 'Fee',
      entityId: fee.id,
      after: fee,
    });

    return created('fee', fee);
  } catch (e) {
    return handleApiError(e);
  }
}
