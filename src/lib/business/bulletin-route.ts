import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireActiveAuth } from '@/lib/api/rbac';
import { ApiError } from '@/lib/api/errors';
import { applyBulletinTransition } from '@/lib/business/bulletin-workflow';

const transitionBody = z.object({ appreciation: z.string().trim().max(2000).optional() }).strict();

export type BulletinAction = 'validate_titulaire' | 'validate_admin' | 'publish';

export async function transitionBulletin(req: NextRequest, bulletinId: string, action: BulletinAction) {
  const auth = await requireActiveAuth(req, ['ADMIN', 'TEACHER']);
  let rawBody: unknown = {};
  try { rawBody = await req.json(); } catch { rawBody = {}; }
  const parsed = transitionBody.safeParse(rawBody);
  if (!parsed.success) throw new ApiError('Appréciation invalide.', 400, 'VALIDATION_ERROR');

  const result = await applyBulletinTransition(req, auth, bulletinId, action, parsed.data.appreciation);
  if (action === 'publish') {
    const bulletin = await db.bulletin.findFirst({
      where: { id: bulletinId, schoolId: auth.schoolId },
      select: { schoolId: true, studentId: true, term: true, academicYear: true, average: true, student: { select: { fullName: true, parentId: true } } },
    });
    if (bulletin) {
      const { notifyUser } = await import('@/services/notifications/notificationEngine');
      const message = `Votre bulletin de la période ${bulletin.term} (${bulletin.academicYear}) est disponible. Moyenne : ${bulletin.average}/20.`;
      await Promise.all([
        notifyUser({ schoolId: bulletin.schoolId, userId: bulletin.studentId, senderId: auth.userId, title: 'Bulletin scolaire disponible', message, type: 'REPORT_CARD', priority: 'HIGH', metadata: { bulletinId } }),
        ...(bulletin.student.parentId ? [notifyUser({ schoolId: bulletin.schoolId, userId: bulletin.student.parentId, senderId: auth.userId, title: `Bulletin de ${bulletin.student.fullName} disponible`, message, type: 'REPORT_CARD', priority: 'HIGH', metadata: { bulletinId, studentId: bulletin.studentId } })] : []),
      ]);
    }
  }
  return result;
}
