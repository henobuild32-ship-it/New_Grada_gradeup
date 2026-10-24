import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifyUser } from '@/services/notifications/notificationEngine';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    // Tenant forcé à la session : le paramètre schoolId du client est ignoré
    const schoolId = auth.schoolId;

    const classes = await db.schoolClass.findMany({
      where: { schoolId, deletedAt: null },
      include: {
        titulaire: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        _count: {
          select: {
            enrollments: true,
            courses: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ classes });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Création : ADMIN uniquement
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Seul un administrateur peut créer une classe.' }, { status: 403 });
    }

    const body = await request.json();
    const { schoolId, name, level, fees, titulaireId, cycle, section, option } = body;

    if (schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }
    if (!schoolId || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: schoolId, name' },
        { status: 400 }
      );
    }

    const existing = await db.schoolClass.findFirst({
      where: { schoolId, name, deletedAt: null },
    });

    if (existing) {
      return NextResponse.json(
        { error: `A class with name "${name}" already exists in this school` },
        { status: 409 }
      );
    }

    const schoolClass = await db.schoolClass.create({
      data: {
        schoolId,
        name,
        level: level || 'Primaire',
        cycle: level === 'Secondaire' ? (cycle === 'Humanites' ? 'Humanites' : 'EB') : (level || 'Primaire'),
        section: level === 'Secondaire' && cycle === 'Humanites' ? String(section || '').trim() : '',
        option: level === 'Secondaire' && cycle === 'Humanites' ? String(option || '').trim() : '',
        fees: typeof fees === 'number' ? fees : parseFloat(fees) || 0,
        titulaireId: titulaireId || null,
      },
      include: {
        titulaire: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        _count: {
          select: {
            enrollments: true,
            courses: true,
          },
        },
      },
    });

    // Marquer l'enseignant comme titulaire si renseigné
    if (titulaireId) {
      await db.user.updateMany({
        where: { id: titulaireId, schoolId },
        data: { isTitulaire: true },
      });
    }

    // Broad broadcast to everyone in the school when a new class is added
    try {
      await notifyUser({
        schoolId,
        title: 'Nouvelle Classe Créée 🏫',
        message: `La classe "${name}" (${level || 'Primaire'}) a été officiellement ajoutée à l'établissement.`,
        type: 'CLASS',
        priority: 'NORMAL',
        targetRole: 'ALL',
        metadata: { classId: schoolClass.id, className: name, level },
      });
    } catch (notifErr) {
      console.error('[Classes] Notification failed (non-blocking):', notifErr);
    }

    return NextResponse.json({ class: schoolClass }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
