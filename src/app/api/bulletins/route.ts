import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireActiveAuth } from '@/lib/api/rbac';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { BulletinStatus } from '@prisma/client';

const BULLETIN_STATUSES = Object.values(BulletinStatus);

/** GET /api/bulletins — canonique, école-scopé et filtré par ownership. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireActiveAuth(req, ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT']);
    const { searchParams } = new URL(req.url);
    const requestedSchoolId = searchParams.get('schoolId');
    if (requestedSchoolId && requestedSchoolId !== auth.schoolId) throw new ApiError('École invalide.', 403, 'TENANT_FORBIDDEN');

    const classId = searchParams.get('classId');
    const requestedStudentId = searchParams.get('studentId');
    const status = searchParams.get('status');
    const term = searchParams.get('term');
    const academicYear = searchParams.get('academicYear');
    if (status && !BULLETIN_STATUSES.includes(status as BulletinStatus)) throw new ApiError('Statut de bulletin invalide.', 400, 'BAD_REQUEST');
    if (term && (!/^\d+$/.test(term) || Number(term) < 1 || Number(term) > 4)) throw new ApiError('La période doit être comprise entre 1 et 4.', 400, 'BAD_REQUEST');

    const where: Record<string, unknown> = { schoolId: auth.schoolId, deletedAt: null };
    if (classId) where.classId = classId;
    if (term) where.term = Number(term);
    if (academicYear) where.academicYear = academicYear;
    if (status) where.status = status;

    if (auth.role === 'STUDENT') {
      where.studentId = auth.userId;
      where.status = BulletinStatus.PUBLISHED;
    } else if (auth.role === 'PARENT') {
      const children = await db.user.findMany({
        where: { schoolId: auth.schoolId, parentId: auth.userId, role: 'STUDENT', active: true, deletedAt: null },
        select: { id: true },
      });
      where.studentId = { in: children.map((child) => child.id) };
      where.status = BulletinStatus.PUBLISHED;
    } else if (auth.role === 'TEACHER') {
      const titularClasses = await db.schoolClass.findMany({
        where: { schoolId: auth.schoolId, titulaireId: auth.userId, deletedAt: null },
        select: { id: true },
      });
      const allowedIds = titularClasses.map((klass) => klass.id);
      if (classId && !allowedIds.includes(classId)) throw new ApiError('Cette classe ne vous est pas attribuée comme titulaire.', 403, 'OWNERSHIP_FORBIDDEN');
      where.classId = classId || { in: allowedIds };
      if (!allowedIds.length) where.id = 'no-bulletins';
    } else if (requestedStudentId) {
      where.studentId = requestedStudentId;
    }

    const bulletins = await db.bulletin.findMany({
      where,
      include: {
        student: { select: { id: true, fullName: true, email: true, gender: true, matricule: true, photoUrl: true, parentId: true } },
        class: { select: { id: true, name: true, level: true, titulaireId: true, titulaire: { select: { id: true, fullName: true } } } },
        validatedByTitulaire: { select: { id: true, fullName: true } },
        validatedByAdmin: { select: { id: true, fullName: true } },
      },
      orderBy: [{ academicYear: 'desc' }, { term: 'asc' }, { rank: 'asc' }],
    });

    return Response.json({ bulletins });
  } catch (error) {
    return handleApiError(error);
  }
}
