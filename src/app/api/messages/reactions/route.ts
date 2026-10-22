import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError, ApiError, assertFound } from '@/lib/api/errors';
import type { AuthUser } from '@/lib/auth/authenticate';

export const runtime = 'nodejs';

async function assertMessageAccess(auth: AuthUser, messageId: string) {
  const message = assertFound(
    await db.message.findUnique({ where: { id: messageId } }),
    'Message non trouvé.'
  );
  const isParticipant = message.senderId === auth.userId || message.recipientId === auth.userId;
  if (!isParticipant) {
    if (auth.role !== 'ADMIN') {
      throw new ApiError('Non autorisé', 403, 'OWNERSHIP_FORBIDDEN');
    }
    assertSchool(auth, message.schoolId);
  }
  return message;
}

// POST /api/messages/reactions — Toggle a reaction on a message
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { messageId, userId, emoji } = await request.json();
    if (!messageId || !userId || !emoji) {
      return NextResponse.json({ error: 'messageId, userId, emoji requis' }, { status: 400 });
    }

    await assertMessageAccess(auth, messageId);

    // Check if reaction already exists
    const existing = await db.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId: auth.userId, emoji } },
    });

    if (existing) {
      // Remove reaction (toggle off)
      await db.messageReaction.delete({ where: { id: existing.id } });
      return NextResponse.json({ action: 'removed', emoji });
    } else {
      // Add reaction (toggle on)
      await db.messageReaction.create({
        data: { messageId, userId: auth.userId, emoji },
      });
      return NextResponse.json({ action: 'added', emoji }, { status: 201 });
    }
  } catch (error) {
    console.error('Error toggling reaction:', error);
    return handleApiError(error);
  }
}

// GET /api/messages/reactions?messageId=xxx — Get reactions for a message
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('messageId');
    if (!messageId) {
      return NextResponse.json({ error: 'messageId requis' }, { status: 400 });
    }

    await assertMessageAccess(auth, messageId);

    const reactions = await db.messageReaction.findMany({
      where: { messageId },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Group by emoji
    const grouped: Record<string, { count: number; users: string[]; hasOwn: boolean }> = {};
    for (const r of reactions) {
      if (!grouped[r.emoji]) {
        grouped[r.emoji] = { count: 0, users: [], hasOwn: false };
      }
      grouped[r.emoji].count++;
      grouped[r.emoji].users.push(r.user.fullName);
    }

    return NextResponse.json({ reactions: grouped });
  } catch (error) {
    console.error('Error fetching reactions:', error);
    return handleApiError(error);
  }
}

// DELETE /api/messages/reactions?id=xxx&userId=xxx — Remove a specific reaction
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId');
    if (!id || !userId) {
      return NextResponse.json({ error: 'id et userId requis' }, { status: 400 });
    }

    await db.messageReaction.deleteMany({ where: { id, userId: auth.userId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing reaction:', error);
    return handleApiError(error);
  }
}
