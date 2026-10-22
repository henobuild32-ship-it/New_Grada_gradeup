import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError, assertFound } from '@/lib/api/errors';

// GET  /api/ai/conversations?userId=xxx  – liste toutes les conversations
// POST /api/ai/conversations              – crée une nouvelle conversation

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const search = searchParams.get('search')?.trim();
    const favorite = searchParams.get('favorite');
    const pinned = searchParams.get('pinned');

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    // Lecture : ses propres conversations, sauf un ADMIN qui peut lister
    // celles d'un autre utilisateur de SON école.
    let ownerId = auth.userId;
    if (auth.role === 'ADMIN' && userId !== auth.userId) {
      const target = assertFound(
        await db.user.findUnique({ where: { id: userId }, select: { schoolId: true } }),
        'Utilisateur introuvable.'
      );
      assertSchool(auth, target.schoolId);
      ownerId = userId;
    }

    const where: any = { userId: ownerId };
    if (favorite === '1') where.favorite = true;
    if (pinned === '1') where.pinned = true;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { tags: { contains: search, mode: 'insensitive' } },
      ];
    }

    let orderBy: any = [{ pinned: 'desc' }, { pinnedAt: 'desc' }, { updatedAt: 'desc' }];
    if (pinned === '1') orderBy = [{ pinnedAt: 'desc' }];

    const conversations = await db.aiConversation.findMany({
      where,
      orderBy,
      select: {
        id: true,
        title: true,
        tags: true,
        favorite: true,
        pinned: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
      },
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const conversation = await db.aiConversation.create({
      data: { userId: auth.userId, title: 'Nouvelle conversation', salutationDone: false },
    });

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return handleApiError(error);
  }
}
