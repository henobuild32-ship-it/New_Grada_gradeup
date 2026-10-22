import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

// GET /api/epst/curriculum?classLevel=...&subject=...&topic=...
export async function GET(request: NextRequest) {
  try {
    // Connexion obligatoire + curriculum scopé à l'école de la session.
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const classLevel = searchParams.get('classLevel');
    const subject = searchParams.get('subject');
    const topic = searchParams.get('topic');

    if (!classLevel || !subject) {
      return NextResponse.json({ error: 'classLevel et subject sont requis' }, { status: 400 });
    }

    const curriculum = await db.ePSTCurriculum.findMany({
      where: {
        schoolId: auth.schoolId,
        classLevel,
        subject,
        topic: topic || undefined,
      },
      orderBy: { order: 'asc' },
    });

    // Le front attend un tableau brut (et non { curriculum }).
    return NextResponse.json(curriculum);
  } catch (error) {
    return handleApiError(error);
  }
}
