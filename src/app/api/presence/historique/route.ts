import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, AuthError } from '@/lib/auth/authenticate';
import { auditFromRequest } from '@/lib/api/audit';

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const userId = searchParams.get('userId');
    const role = searchParams.get('role');
    const daysStr = searchParams.get('days') || '30';
    const days = Math.min(parseInt(daysStr, 10) || 30, 90);

    if (!schoolId || schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'schoolId invalide' }, { status: 400 });
    }

    const where: Record<string, unknown> = { schoolId, deletedAt: null };
    if (auth.role === 'ADMIN') {
      if (userId) where.userId = userId;
    } else if (auth.role === 'PARENT') {
      const children = await db.user.findMany({
        where: { schoolId, parentId: auth.userId, role: 'STUDENT', active: true, deletedAt: null },
        select: { id: true },
      });
      const ids = children.map((child) => child.id);
      if (userId && !ids.includes(userId)) return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      where.userId = userId || { in: ids.length ? ids : ['__no-linked-child__'] };
    } else if (auth.role === 'STUDENT' || auth.role === 'TEACHER') {
      if (userId && userId !== auth.userId) return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      where.userId = auth.userId;
    } else {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    where.date = { gte: since };
    if (role) where.user = { role };

    const presences = await db.presence.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
            photoUrl: true,
            classEnrollments: {
              select: { class: { select: { name: true } } },
              take: 1,
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    const dailyMap = new Map<string, { present: number; retard: number; justifie: number; absent: number }>();
    presences.forEach((p) => {
      const key = p.date.toISOString().split('T')[0];
      if (!dailyMap.has(key)) dailyMap.set(key, { present: 0, retard: 0, justifie: 0, absent: 0 });
      const d = dailyMap.get(key)!;
      if (p.statut === 'PRESENT') d.present++;
      else if (p.statut === 'RETARD') d.retard++;
      else if (p.statut === 'JUSTIFIE') d.justifie++;
    });
    const chartData = Array.from(dailyMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ presences, chartData, total: presences.length });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Seul un administrateur peut valider des justifications' }, { status: 403 });
    }

    const body = await request.json();
    const { presenceId } = body;

    if (!presenceId) {
      return NextResponse.json({ error: 'presenceId requis' }, { status: 400 });
    }

    const existing = await db.presence.findFirst({
      where: { id: presenceId, schoolId: auth.schoolId, deletedAt: null },
      select: { id: true, statut: true, userId: true, user: { select: { fullName: true, parentId: true } } },
    });
    if (!existing) return NextResponse.json({ error: 'Présence introuvable dans votre établissement' }, { status: 404 });

    const updated = await db.presence.update({
      where: { id: existing.id },
      data: {
        statut: 'JUSTIFIE',
        validePar: auth.userId,
      },
    });

    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'PRESENCE_JUSTIFICATION_APPROVE',
      entity: 'Presence',
      entityId: existing.id,
      before: { status: existing.statut },
      after: { status: 'JUSTIFIE', studentId: existing.userId },
    });
    if (existing.statut !== 'JUSTIFIE') {
      const { notifyUser } = await import('@/services/notifications/notificationEngine');
      const message = `La justification de présence de ${existing.user.fullName} a été validée.`;
      await Promise.all([
        notifyUser({ schoolId: auth.schoolId, userId: existing.userId, senderId: auth.userId, title: 'Justification validée', message, type: 'ATTENDANCE', priority: 'NORMAL', metadata: { presenceId: existing.id } }),
        ...(existing.user.parentId ? [notifyUser({ schoolId: auth.schoolId, userId: existing.user.parentId, senderId: auth.userId, title: 'Justification validée', message, type: 'ATTENDANCE', priority: 'NORMAL', metadata: { presenceId: existing.id, studentId: existing.userId } })] : []),
      ]);
    }

    return NextResponse.json({ presence: updated });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
