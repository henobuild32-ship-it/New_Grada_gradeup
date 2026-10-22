import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError, ApiError, assertFound } from '@/lib/api/errors';
import { ok } from '@/lib/api/response';
import { reviewJustificationSchema, parseOrThrow } from '@/lib/validation/entities';
import { auditFromRequest } from '@/lib/api/audit';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, ['ADMIN', 'TEACHER']);
    const { id } = await params;

    const justification = assertFound(
      await db.absenceJustification.findUnique({ where: { id } }),
      'Justification introuvable.'
    );
    assertSchool(auth, justification.schoolId);

    // TEACHER : autorisé s'il est titulaire de la classe de l'élève ou enseigne
    // au moins un cours de cette classe. ADMIN : toujours autorisé.
    if (auth.role === 'TEACHER') {
      const student = assertFound(
        await db.user.findUnique({
          where: { id: justification.studentId },
          select: {
            classEnrollments: { select: { classId: true } },
          },
        }),
        'Élève introuvable.'
      );
      const classIds = student.classEnrollments.map((e) => e.classId);
      if (classIds.length === 0) throw new ApiError('Aucune classe associée à cet élève.', 403, 'OWNERSHIP_FORBIDDEN');

      const titular = await db.schoolClass.findFirst({
        where: { id: { in: classIds }, titulaireId: auth.userId },
        select: { id: true },
      });
      if (!titular) {
        const teaches = await db.course.findFirst({
          where: { classId: { in: classIds }, teacherId: auth.userId },
          select: { id: true },
        });
        if (!teaches) {
          throw new ApiError('Accès refusé : vous n’êtes pas titulaire ou enseignant de cette classe.', 403, 'OWNERSHIP_FORBIDDEN');
        }
      }
    }

    const body = await req.json();
    const data = parseOrThrow(reviewJustificationSchema, body);

    const updated = await db.absenceJustification.update({
      where: { id },
      data: {
        status: data.status,
        reviewedById: auth.userId,
        reviewedAt: new Date(),
        reviewNote: data.reviewNote ?? '',
      },
    });

    await auditFromRequest(req, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'ATTENDANCE_REVIEW',
      entity: 'AbsenceJustification',
      entityId: id,
      before: justification,
      after: updated,
    });

    return ok('absenceJustification', updated);
  } catch (e) {
    return handleApiError(e);
  }
}
