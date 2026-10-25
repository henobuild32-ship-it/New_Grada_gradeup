import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifyUser } from '@/services/notifications/notificationEngine';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { auditFromRequest } from '@/lib/api/audit';

async function validateHumanitiesPlacement(schoolId: string, level: string, cycle: string, sectionName: string, optionName: string) {
  if (level !== 'Secondaire' || cycle !== 'Humanites') return null;
  if (!sectionName || !optionName) return 'Une section et une option sont obligatoires pour une classe d’Humanités.';
  const configured = await db.humanitiesOption.findFirst({
    where: { name: optionName, section: { schoolId, name: sectionName } },
    select: { id: true },
  });
  return configured ? null : 'Cette option ne fait pas partie de la section configurée pour votre école.';
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    // Tenant forcé à la session : le paramètre schoolId du client est ignoré
    const schoolId = auth.schoolId;
    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (auth.role === 'TEACHER') {
      where.OR = [
        { titulaireId: auth.userId },
        { courses: { some: { teacherId: auth.userId, schoolId, deletedAt: null } } },
      ];
    } else if (auth.role === 'STUDENT') {
      where.enrollments = { some: { userId: auth.userId } };
    } else if (auth.role === 'PARENT') {
      where.enrollments = { some: { user: { schoolId, parentId: auth.userId, role: 'STUDENT', active: true, deletedAt: null } } };
    } else if (!['ADMIN', 'LECTEUR'].includes(auth.role)) {
      return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 });
    }

    const classes = await db.schoolClass.findMany({
      where,
      include: {
        titulaire: {
          select: {
            id: true,
            fullName: true,
            ...(auth.role === 'ADMIN' ? { email: true, phone: true } : {}),
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

    const classLevel = String(level || 'Primaire');
    const classCycle = classLevel === 'Secondaire' && cycle === 'Humanites' ? 'Humanites' : classLevel === 'Secondaire' ? 'EB' : classLevel;
    const sectionName = classLevel === 'Secondaire' && classCycle === 'Humanites' ? String(section || '').trim() : '';
    const optionName = classLevel === 'Secondaire' && classCycle === 'Humanites' ? String(option || '').trim() : '';
    const placementError = await validateHumanitiesPlacement(schoolId, classLevel, classCycle, sectionName, optionName);
    if (placementError) return NextResponse.json({ error: placementError }, { status: 400 });

    if (titulaireId) {
      const teacher = await db.user.findFirst({ where: { id: titulaireId, schoolId, role: 'TEACHER', active: true, deletedAt: null }, select: { id: true } });
      if (!teacher) return NextResponse.json({ error: 'Le professeur titulaire doit être actif dans cette école.' }, { status: 400 });
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
        level: classLevel,
        cycle: classCycle,
        section: sectionName,
        option: optionName,
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
    await auditFromRequest(request, {
      schoolId,
      userId: auth.userId,
      action: 'CLASS_CREATED',
      entity: 'SchoolClass',
      entityId: schoolClass.id,
      after: { id: schoolClass.id, name: schoolClass.name, level: schoolClass.level, cycle: schoolClass.cycle, section: schoolClass.section, option: schoolClass.option },
    }).catch((error) => console.error('[Classes] Audit write failed:', error));

    // Marquer l'enseignant comme titulaire si renseigné
    if (titulaireId) {
      await db.user.updateMany({
        where: { id: titulaireId, schoolId },
        data: { isTitulaire: true },
      });
      await notifyUser({
        schoolId,
        senderId: auth.userId,
        userId: titulaireId,
        targetRole: 'TEACHER',
        title: 'Classe attribuée',
        message: `${auth.name} vous a confié la classe « ${name} »${classCycle === 'Humanites' ? ` (${sectionName} · ${optionName})` : ''}, le ${new Date().toLocaleString('fr-FR')}.`,
        type: 'CLASS',
        priority: 'NORMAL',
        metadata: { classId: schoolClass.id, className: name, changedAt: new Date().toISOString() },
      }).catch((error) => console.error('[Classes] Titular assignment notification failed:', error));
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
