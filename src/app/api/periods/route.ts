import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError, ApiError } from '@/lib/api/errors';
import { parseListParams, list, ok, created } from '@/lib/api/response';
import { periodSchema, parseOrThrow } from '@/lib/validation/entities';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const pagination = parseListParams(searchParams);

    const where: any = { schoolId: auth.schoolId, deletedAt: null };
    const status = searchParams.get('status');
    if (status) where.status = status;
    const trimester = searchParams.get('trimester');
    if (trimester) where.trimester = parseInt(trimester, 10);

    const [total, rows] = await Promise.all([
      db.period.count({ where }),
      db.period.findMany({ where, orderBy: pagination.orderBy, skip: pagination.skip, take: pagination.take }),
    ]);

    return list('period', rows, { page: pagination.page, pageSize: pagination.pageSize, total, totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['ADMIN', 'TEACHER']);
    const body = await req.json();
    const data = parseOrThrow(periodSchema, body);

    const existing = await db.period.findFirst({
      where: { schoolId: auth.schoolId, code: data.code, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw new ApiError('Une période avec ce code existe déjà dans l’établissement.', 409, 'CONFLICT');

    const period = await db.period.create({
      data: {
        schoolId: auth.schoolId,
        name: data.name,
        code: data.code,
        trimester: data.trimester ?? 1,
        semester: data.semester ?? null,
        startDate: data.startDate,
        endDate: data.endDate,
        schoolYearId: data.schoolYearId || '',
      },
    });

    return created('period', period);
  } catch (e) {
    return handleApiError(e);
  }
}
