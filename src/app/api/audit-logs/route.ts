import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';
import { parseListParams, list } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['ADMIN']);
    const { searchParams } = new URL(req.url);
    const pagination = parseListParams(searchParams, { createdAt: 'desc' });

    const where: any = { schoolId: auth.schoolId };
    const entity = searchParams.get('entity');
    if (entity) where.entity = entity;
    const action = searchParams.get('action');
    if (action) where.action = action;
    const userId = searchParams.get('userId');
    if (userId) where.userId = userId;
    const from = searchParams.get('from');
    if (from) where.createdAt = { ...(where.createdAt ?? {}), gte: new Date(from) };
    const to = searchParams.get('to');
    if (to) where.createdAt = { ...(where.createdAt ?? {}), lte: new Date(to) };

    const [total, rows] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: pagination.orderBy,
        skip: pagination.skip,
        take: pagination.take,
        include: {
          user: { select: { id: true, fullName: true, role: true } },
        },
      }),
    ]);

    return list('auditLog', rows, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
