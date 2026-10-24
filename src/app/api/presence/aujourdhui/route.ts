import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, AuthError } from '@/lib/auth/authenticate';

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const userId = searchParams.get('userId');

    if (!schoolId || schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'schoolId invalide' }, { status: 400 });
    }

    let scopedUserIds: string[] | null = null;
    if (auth.role === 'PARENT') {
      const children = await db.user.findMany({
        where: { schoolId, parentId: auth.userId, role: 'STUDENT', active: true, deletedAt: null },
        select: { id: true },
      });
      scopedUserIds = children.map((child) => child.id);
      if (userId && !scopedUserIds.includes(userId)) return NextResponse.json({ error: 'Vous ne pouvez consulter que la présence de vos enfants' }, { status: 403 });
    } else if (auth.role === 'STUDENT' || auth.role === 'TEACHER') {
      if (userId && userId !== auth.userId) return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      scopedUserIds = [auth.userId];
    } else if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 86400000);

    const effectiveUserIds = userId ? [userId] : scopedUserIds;
    if (userId) {
      const presence = await db.presence.findFirst({
        where: {
          schoolId,
          userId,
          date: { gte: today, lt: tomorrow },
          deletedAt: null,
        },
        include: {
          user: { select: { fullName: true, role: true, photoUrl: true } },
        },
      });

      return NextResponse.json({ presence });
    }

    const presences = await db.presence.findMany({
      where: {
        schoolId,
        date: { gte: today, lt: tomorrow },
        deletedAt: null,
        ...(effectiveUserIds ? { userId: { in: effectiveUserIds.length ? effectiveUserIds : ['__no-linked-child__'] } } : {}),
      },
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
      orderBy: { heureArrivee: 'asc' },
    });

    if (auth.role !== 'ADMIN') return NextResponse.json({ presences });

    const [totalStudents, totalTeachers] = await Promise.all([
      db.user.count({ where: { schoolId, role: 'STUDENT', active: true } }),
      db.user.count({ where: { schoolId, role: 'TEACHER', active: true } }),
    ]);

    const presents = presences.filter((p) => p.statut === 'PRESENT').length;
    const retards = presences.filter((p) => p.statut === 'RETARD').length;
    const justifies = presences.filter((p) => p.statut === 'JUSTIFIE').length;
    const total = totalStudents + totalTeachers;
    const absents = Math.max(0, total - presences.length);
    const tauxPresence = total > 0 ? Math.round(((presents + retards + justifies) / total) * 100) : 0;

    return NextResponse.json({
      presences,
      stats: {
        total,
        totalStudents,
        totalTeachers,
        presents,
        retards,
        justifies,
        absents,
        tauxPresence,
        date: today.toISOString(),
      },
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
