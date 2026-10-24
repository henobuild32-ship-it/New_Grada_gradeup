import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireActiveAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireActiveAuth(request, ['ADMIN', 'TEACHER']);
    const { searchParams } = new URL(request.url);
    // Tenant forcé à la session ; un titulaire ne liste que ses propres réceptions
    const schoolId = auth.schoolId;
    const titulaireId = auth.role === 'TEACHER' ? auth.userId : searchParams.get('titulaireId');
    const classId = searchParams.get('classId');
    const status = searchParams.get('status');
    const trimester = searchParams.get('trimester');
    const schoolYearId = searchParams.get('schoolYearId');

    if (!titulaireId) {
      return NextResponse.json({ error: 'titulaireId et schoolId requis' }, { status: 400 });
    }

    const where: Record<string, unknown> = {
      titulaireId,
      schoolId,
    };

    if (classId) where.classId = classId;
    if (status) where.status = status;
    if (trimester || schoolYearId) {
      where.evaluation = { ...(trimester ? { trimester } : {}), ...(schoolYearId ? { schoolYearId } : {}) };
    }

    const transmissions = await db.cotationTransmission.findMany({
      where,
      include: {
        evaluation: {
          include: {
            marks: true,
          },
        },
        course: true,
        class: { select: { id: true, name: true, level: true } },
        teacher: { select: { id: true, fullName: true, photoUrl: true } },
      },
      orderBy: { sentAt: 'desc' },
    });

    return NextResponse.json({ transmissions });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
