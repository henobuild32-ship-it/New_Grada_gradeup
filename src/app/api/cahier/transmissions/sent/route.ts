import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['ADMIN', 'TEACHER']);
    const { searchParams } = new URL(request.url);
    // Tenant forcé à la session ; un enseignant ne liste que ses propres transmissions
    const schoolId = auth.schoolId;
    const teacherId = auth.role === 'TEACHER' ? auth.userId : searchParams.get('teacherId');

    if (!teacherId) {
      return NextResponse.json({ error: 'teacherId et schoolId requis' }, { status: 400 });
    }

    const transmissions = await db.cotationTransmission.findMany({
      where: {
        teacherId,
        schoolId,
      },
      include: {
        evaluation: {
          include: {
            class: { select: { id: true, name: true } },
            course: { select: { id: true, name: true } },
          },
        },
        class: { select: { id: true, name: true } },
        course: { select: { id: true, name: true } },
        titulaire: { select: { id: true, fullName: true, photoUrl: true } },
      },
      orderBy: { sentAt: 'desc' },
    });

    return NextResponse.json({ transmissions });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
