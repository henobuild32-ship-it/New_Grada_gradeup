import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { notifyUser } from '@/services/notifications/notificationEngine';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Action réservée aux administrateurs.' }, { status: 403 });
    }

    const body = await request.json();
    const { action, userIds } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'Liste d’identifiants requise.' }, { status: 400 });
    }

    if (!['activate', 'deactivate', 'delete'].includes(action)) {
      return NextResponse.json({ error: 'Action non reconnue.' }, { status: 400 });
    }

    // Sécurité multi-tenant : ne cibler QUE les utilisateurs de la même école
    const validUsers = await db.user.findMany({
      where: {
        id: { in: userIds },
        schoolId: auth.schoolId,
        // Ne pas permettre de se désactiver/supprimer soi-même
        NOT: { id: auth.userId },
      },
      select: { id: true, fullName: true, role: true, active: true },
    });

    const targetIds = validUsers.map((u) => u.id);

    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'Aucun utilisateur modifiable sélectionné.' }, { status: 400 });
    }

    if (action === 'activate') {
      const changedUsers = validUsers.filter((user) => user.active === false);
      await db.user.updateMany({
        where: { id: { in: changedUsers.map((user) => user.id) } },
        data: { active: true, authVersion: { increment: 1 } },
      });
      await Promise.allSettled(changedUsers.map((user) => notifyUser({
        schoolId: auth.schoolId,
        userId: user.id,
        title: 'Compte activé',
        message: 'Votre compte GradeUp a été activé par la direction.',
        type: 'SYSTEM',
        priority: 'HIGH',
        metadata: { userId: user.id, active: true },
      })));
      return NextResponse.json({ success: true, count: targetIds.length, message: `${targetIds.length} compte(s) activé(s).` });
    }

    if (action === 'deactivate') {
      const changedUsers = validUsers.filter((user) => user.active !== false);
      await db.user.updateMany({
        where: { id: { in: changedUsers.map((user) => user.id) } },
        data: { active: false, authVersion: { increment: 1 } },
      });
      await Promise.allSettled(changedUsers.map((user) => notifyUser({
        schoolId: auth.schoolId,
        userId: user.id,
        title: 'Compte désactivé',
        message: 'Votre compte GradeUp a été désactivé par la direction.',
        type: 'SYSTEM',
        priority: 'HIGH',
        metadata: { userId: user.id, active: false },
      })));
      return NextResponse.json({ success: true, count: targetIds.length, message: `${targetIds.length} compte(s) désactivé(s).` });
    }

    if (action === 'delete') {
      // Soft-delete : date de suppression + inactif
      await db.user.updateMany({
        where: { id: { in: targetIds } },
        data: { deletedAt: new Date(), active: false },
      });
      return NextResponse.json({ success: true, count: targetIds.length, message: `${targetIds.length} compte(s) supprimé(s).` });
    }

    return NextResponse.json({ error: 'Action invalide.' }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
