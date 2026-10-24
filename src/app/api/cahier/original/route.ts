import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { db } from '@/lib/db';
import { createPrivateFileUrl } from '@/lib/storage';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const evaluationId = new URL(request.url).searchParams.get('evaluationId');
    if (!evaluationId) return NextResponse.json({ error: 'evaluationId requis.' }, { status: 400 });

    const evaluation = await db.cahierEvaluation.findFirst({
      where: { id: evaluationId, schoolId: auth.schoolId, deletedAt: null },
      select: {
        sourceDocumentPath: true,
        teacherId: true,
        class: { select: { titulaireId: true } },
      },
    });
    if (!evaluation || !evaluation.sourceDocumentPath) {
      return NextResponse.json({ error: 'Le document original est introuvable.' }, { status: 404 });
    }

    const permitted = auth.role === 'ADMIN' || evaluation.teacherId === auth.userId || evaluation.class.titulaireId === auth.userId;
    if (!permitted) return NextResponse.json({ error: 'Accès refusé au document original.' }, { status: 403 });

    const url = await createPrivateFileUrl(evaluation.sourceDocumentPath);
    return NextResponse.redirect(url, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Le document original est momentanément indisponible.' }, { status: 503 });
  }
}
