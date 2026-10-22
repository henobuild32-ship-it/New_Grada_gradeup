import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, childrenIds } from '@/lib/api/rbac';
import { handleApiError, ApiError } from '@/lib/api/errors';
import { parseListParams, list, created } from '@/lib/api/response';
import { absenceJustificationSchema, parseOrThrow } from '@/lib/validation/entities';
import { auditFromRequest } from '@/lib/api/audit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const pagination = parseListParams(searchParams);

    const where: any = { schoolId: auth.schoolId, deletedAt: null };
    if (auth.role === 'ADMIN' || auth.role === 'TEACHER') {
      // toute l'école
    } else if (auth.role === 'PARENT') {
      const kids = await childrenIds(auth.userId);
      where.OR = [{ explainedById: auth.userId }, { studentId: { in: kids } }];
    } else {
      where.studentId = auth.userId;
    }

    const status = searchParams.get('status');
    if (status) where.status = status;
    const studentIdFilter = searchParams.get('studentId');
    if (studentIdFilter) where.studentId = studentIdFilter;

    const [total, rows] = await Promise.all([
      db.absenceJustification.count({ where }),
      db.absenceJustification.findMany({
        where,
        orderBy: pagination.orderBy,
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);

    return list('absenceJustification', rows, {
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
    const auth = await requireAuth(req, ['PARENT', 'STUDENT', 'ADMIN']);
    const body = await req.json();
    const data = parseOrThrow(absenceJustificationSchema, body);

    let studentId = data.studentId;
    if (auth.role === 'STUDENT') {
      studentId = auth.userId;
    } else if (auth.role === 'PARENT') {
      const child = await db.user.findFirst({
        where: { id: studentId, parentId: auth.userId, deletedAt: null },
        select: { id: true },
      });
      if (!child) {
        throw new ApiError('Accès refusé : ce compte n’est pas votre enfant.', 403, 'OWNERSHIP_FORBIDDEN');
      }
    } else {
      const student = await db.user.findFirst({
        where: { id: studentId, schoolId: auth.schoolId, deletedAt: null },
        select: { id: true },
      });
      if (!student) throw new ApiError('Élève introuvable.', 404, 'NOT_FOUND');
    }

    const justification = await db.absenceJustification.create({
      data: {
        schoolId: auth.schoolId,
        attendanceId: data.attendanceId || null,
        studentId,
        explainedById: auth.userId,
        reason: data.reason,
        documentUrl: data.documentUrl || '',
        status: 'PENDING',
      },
    });

    await auditFromRequest(req, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'ATTENDANCE_JUSTIFY',
      entity: 'AbsenceJustification',
      entityId: justification.id,
      after: justification,
    });

    return created('absenceJustification', justification);
  } catch (e) {
    return handleApiError(e);
  }
}
