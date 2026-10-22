import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError, ApiError } from '@/lib/api/errors';
import type { AuthUser } from '@/lib/auth/authenticate';

// GET    /api/ai/conversations/[id]?userId=xxx  – récupère une conversation avec ses messages
// DELETE /api/ai/conversations/[id]             – supprime une conversation

type ConversationRecord = { userId: string };

async function assertConversationAccess(auth: AuthUser, conversation: ConversationRecord): Promise<void> {
  if (conversation.userId === auth.userId) return;
  if (auth.role !== 'ADMIN') {
    throw new ApiError('Accès refusé : cette conversation ne vous appartient pas.', 403, 'OWNERSHIP_FORBIDDEN');
  }
  const owner = await db.user.findUnique({
    where: { id: conversation.userId },
    select: { schoolId: true },
  });
  assertSchool(auth, owner?.schoolId);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const conversation = await db.aiConversation.findFirst({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        documents: { select: { id: true, name: true, mimeType: true, size: true, summary: true, createdAt: true } },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 });
    }

    await assertConversationAccess(auth, conversation);

    return NextResponse.json({ conversation });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const { userId, title, tags, favorite, pinned } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const conversation = await db.aiConversation.findFirst({ where: { id } });
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 });
    }

    await assertConversationAccess(auth, conversation);

    const data: Record<string, unknown> = {};
    if (typeof title === 'string' && title.trim()) data.title = title.trim();
    if (typeof tags === 'string') data.tags = tags;
    if (typeof favorite === 'boolean') data.favorite = favorite;
    if (typeof pinned === 'boolean') {
      data.pinned = pinned;
      data.pinnedAt = pinned ? new Date() : null;
    }

    const updated = await db.aiConversation.update({ where: { id }, data });
    return NextResponse.json({ conversation: updated });
  } catch (error) {
    console.error('Error updating conversation:', error);
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const conversation = await db.aiConversation.findFirst({
      where: { id },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 });
    }

    await assertConversationAccess(auth, conversation);

    await db.aiConversation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return handleApiError(error);
  }
}
