import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, childrenIds } from '@/lib/api/rbac';
import { handleApiError, ApiError } from '@/lib/api/errors';
import { parseListParams, list } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const pagination = parseListParams(searchParams);

    const where: any = { schoolId: auth.schoolId };

    if (auth.role === 'STUDENT') {
      where.studentId = auth.userId;
    } else if (auth.role === 'PARENT') {
      const kids = await childrenIds(auth.userId);
      where.studentId = { in: kids };
    }
    // ADMIN / TEACHER → toute l'école

    const studentId = searchParams.get('studentId');
    if (studentId) {
      if (auth.role === 'STUDENT' && studentId !== auth.userId) {
        throw new ApiError('Accès refusé : un élève ne voit que ses données.', 403, 'OWNERSHIP_FORBIDDEN');
      }
      where.studentId = studentId;
    }
    const trimester = searchParams.get('trimester');
    if (trimester) where.trimester = trimester;
    const courseId = searchParams.get('courseId');
    if (courseId) where.courseId = courseId;

    const [total, rows] = await Promise.all([
      db.gradeSnapshot.count({ where }),
      db.gradeSnapshot.findMany({
        where,
        orderBy: pagination.orderBy,
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);

    return list('gradeSnapshot', rows, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
