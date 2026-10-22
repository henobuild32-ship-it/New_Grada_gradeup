import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

export const runtime = 'nodejs';

// GET /api/messages/search?userId=xxx&schoolId=xxx&q=xxx
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const q = searchParams.get('q');

    if (!userId || !q?.trim()) {
      return NextResponse.json({ error: 'userId et q requis' }, { status: 400 });
    }

    const searchTerm = q.trim();
    const targetUserId = auth.role === 'ADMIN' ? userId : auth.userId;

    const messages = await db.message.findMany({
      where: {
        schoolId: auth.schoolId,
        content: { contains: searchTerm, mode: 'insensitive' },
        deletedAt: null,
        OR: [
          { senderId: targetUserId },
          { recipientId: targetUserId },
        ],
      },
      include: {
        sender: { select: { id: true, fullName: true, photoUrl: true } },
        recipient: { select: { id: true, fullName: true, photoUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error searching messages:', error);
    return handleApiError(error);
  }
}
