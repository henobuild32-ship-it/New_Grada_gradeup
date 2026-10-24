import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';

export const runtime = 'nodejs';

// GET /api/school-years
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequestActive(req);
    // Tenant forcé à la session : le paramètre schoolId du client est ignoré
    const schoolId = auth.schoolId;

    const years = await db.schoolYear.findMany({
      where: { schoolId },
      select: { id: true, year: true, status: true, closedAt: true },
      orderBy: { year: 'desc' },
    });

    return NextResponse.json({ years });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[GET /api/school-years]', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/school-years — créer une nouvelle année scolaire
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequestActive(req);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Action réservée aux administrateurs.' }, { status: 403 });
    }
    const body = await req.json();
    const { year, status } = body;

    if (!year || typeof year !== 'string') {
      return NextResponse.json({ error: 'Année requise (ex: 2026-2027).' }, { status: 400 });
    }

    const existing = await db.schoolYear.findUnique({
      where: { schoolId_year: { schoolId: auth.schoolId, year: year.trim() } },
    });
    if (existing) {
      return NextResponse.json({ error: 'Cette année scolaire existe déjà.' }, { status: 409 });
    }

    // Si la nouvelle année est 'OPEN', on peut passer les autres en LOCKED ou CLOSED
    if (status === 'OPEN') {
      await db.schoolYear.updateMany({
        where: { schoolId: auth.schoolId, status: 'OPEN' },
        data: { status: 'LOCKED' },
      });
    }

    const newYear = await db.schoolYear.create({
      data: {
        schoolId: auth.schoolId,
        year: year.trim(),
        status: status || 'OPEN',
      },
    });

    return NextResponse.json({ year: newYear }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[POST /api/school-years]', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PUT /api/school-years — mettre à jour le statut d'une année scolaire
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequestActive(req);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Action réservée aux administrateurs.' }, { status: 403 });
    }
    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'id et status requis' }, { status: 400 });
    }

    const existing = await db.schoolYear.findFirst({
      where: { id, schoolId: auth.schoolId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Année scolaire introuvable' }, { status: 404 });
    }

    if (status === 'OPEN') {
      await db.schoolYear.updateMany({
        where: { schoolId: auth.schoolId, status: 'OPEN', NOT: { id } },
        data: { status: 'LOCKED' },
      });
    }

    const updated = await db.schoolYear.update({
      where: { id },
      data: {
        status,
        ...(status === 'CLOSED' ? { closedAt: new Date(), closedById: auth.userId } : {}),
      },
    });

    return NextResponse.json({ year: updated });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[PUT /api/school-years]', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
