import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

export async function POST(request: NextRequest) {
  try {
    // Appelé depuis l'admin (et les enseignants) : jamais un élève/parent
    const auth = await requireAuth(request, ['ADMIN', 'TEACHER']);
    const schoolId = auth.schoolId;
    const body = await request.json();
    const { classId, trimester } = body;

    if (!schoolId || !classId || !trimester) {
      return NextResponse.json({ error: 'schoolId, classId, trimester are required' }, { status: 400 });
    }

    // Obtenir ou créer le compteur pour l'école/classe/trimestre
    let counter = await db.reportCounter.findUnique({
      where: { schoolId_classId_trimester: { schoolId, classId, trimester } }
    });

    if (!counter) {
      counter = await db.reportCounter.create({
        data: {
          schoolId,
          classId,
          trimester,
          count: 0
        }
      });
    }

    // Incrémenter le compteur
    const updatedCounter = await db.reportCounter.update({
      where: { id: counter.id },
      data: { count: { increment: 1 } }
    });

    return NextResponse.json({
      canGenerate: true,
      counter: updatedCounter.count
    });
  } catch (error) {
    return handleApiError(error);
  }
}
