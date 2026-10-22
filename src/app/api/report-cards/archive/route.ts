import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

export async function GET(request: NextRequest) {
  try {
    // Appelé depuis l'admin (et les enseignants) : jamais un élève/parent
    const auth = await requireAuth(request, ['ADMIN', 'TEACHER']);
    const schoolId = auth.schoolId;

    const reportCards = await db.reportCard.findMany({
      where: { schoolId },
      include: {
        class: {
          select: { name: true }
        },
        student: {
          select: { fullName: true, photoUrl: true }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({ reportCards });
  } catch (error) {
    return handleApiError(error);
  }
}
