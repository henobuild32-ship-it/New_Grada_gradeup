import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, childrenIds } from '@/lib/api/rbac';
import { handleApiError, ApiError } from '@/lib/api/errors';
import { parseListParams, list, created } from '@/lib/api/response';
import { eventSchema, parseOrThrow } from '@/lib/validation/entities';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const pagination = parseListParams(searchParams, { startsAt: 'asc' });

    const where: any = { schoolId: auth.schoolId, deletedAt: null };

    // Visibilité par rôle
    if (auth.role === 'STUDENT' || auth.role === 'PARENT') {
      const studentIds = auth.role === 'PARENT' ? await childrenIds(auth.userId) : [auth.userId];
      const enrollments = await db.enrolledClass.findMany({
        where: { userId: { in: studentIds }, class: { schoolId: auth.schoolId, deletedAt: null } },
        select: { classId: true },
      });
      const classIds = enrollments.map((e) => e.classId);
      const tit = await db.schoolClass.findMany({ where: { titulaireId: auth.userId }, select: { id: true } });
      const allowed = [...new Set([...classIds, ...tit.map((t) => t.id)])];
      where.OR = [
        { targetType: { not: 'CLASS' } },
        { targetClassId: { in: allowed } },
      ];
    }

    const targetType = searchParams.get('targetType');
    if (targetType) where.targetType = targetType;
    const targetClassId = searchParams.get('targetClassId');
    if (targetClassId) where.targetClassId = targetClassId;
    const from = searchParams.get('from');
    if (from) where.startsAt = { ...(where.startsAt ?? {}), gte: new Date(from) };
    const to = searchParams.get('to');
    if (to) where.startsAt = { ...(where.startsAt ?? {}), lte: new Date(to) };

    const [total, rows] = await Promise.all([
      db.event.count({ where }),
      db.event.findMany({
        where,
        orderBy: pagination.orderBy,
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);

    return list('event', rows, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['ADMIN', 'TEACHER']);
    const body = await req.json();
    const data = parseOrThrow(eventSchema, body);

    if (data.targetType === 'CLASS' && !data.targetClassId) {
      throw new ApiError('targetClassId requis pour une cible CLASS.', 400, 'BAD_REQUEST');
    }

    const event = await db.event.create({
      data: {
        schoolId: auth.schoolId,
        title: data.title,
        description: data.description || '',
        startsAt: data.startsAt,
        endsAt: data.endsAt ?? null,
        location: data.location || '',
        targetType: data.targetType || 'SCHOOL',
        targetClassId: data.targetClassId || '',
        createdById: auth.userId,
      },
    });

    return created('event', event);
  } catch (e) {
    return handleApiError(e);
  }
}
