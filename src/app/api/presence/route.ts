import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

export const runtime = 'nodejs';

// POST /api/presence — Update user presence (heartbeat)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { isOnline } = await request.json();
    // Heartbeat : on ne met à jour QUE la présence de l'utilisateur de la session.
    const userId = auth.userId;

    await db.userPresence.upsert({
      where: { userId },
      update: { isOnline: isOnline !== false, lastSeen: new Date(), updatedAt: new Date() },
      create: { userId, isOnline: isOnline !== false, lastSeen: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET /api/presence?userIds=id1,id2,id3 — Get presence for multiple users
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const userIds = searchParams.get('userIds');

    if (!userIds) {
      return NextResponse.json({ error: 'userIds requis' }, { status: 400 });
    }

    const ids = userIds.split(',').filter(Boolean);

    // Multi-tenant : on ne lit la présence que des comptes de sa propre école.
    const allowedUsers = await db.user.findMany({
      where: { id: { in: ids }, schoolId: auth.schoolId },
      select: { id: true },
    });
    const allowedIds = allowedUsers.map((u) => u.id);

    const presences = await db.userPresence.findMany({
      where: { userId: { in: allowedIds } },
      select: { userId: true, isOnline: true, lastSeen: true },
    });

    // Map for easy lookup
    const presenceMap: Record<string, { isOnline: boolean; lastSeen: Date }> = {};
    for (const p of presences) {
      // Consider user offline if last seen > 2 minutes ago
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
      presenceMap[p.userId] = {
        isOnline: p.isOnline && p.lastSeen > twoMinAgo,
        lastSeen: p.lastSeen,
      };
    }

    return NextResponse.json({ presences: presenceMap });
  } catch (error) {
    return handleApiError(error);
  }
}
