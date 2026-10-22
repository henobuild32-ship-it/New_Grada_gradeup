import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const unreadMessages = await db.message.count({
      where: {
        schoolId: auth.schoolId,
        recipientId: auth.userId,
        read: false,
      },
    });

    return NextResponse.json({
      unreadMessages,
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return handleApiError(error);
  }
}
