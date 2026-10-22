import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

export const runtime = 'nodejs';

// GET    /api/ai/memory?userId=xxx&search=xxx&tag=xxx  – liste les souvenirs
// POST   /api/ai/memory                                – crée un souvenir
// PUT    /api/ai/memory                                – met à jour un souvenir
// DELETE /api/ai/memory?id=xxx&userId=xxx              – supprime un souvenir

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const search = searchParams.get('search');
    const tag = searchParams.get('tag');
    if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });

    const where: Record<string, unknown> = { userId: auth.userId, schoolId: auth.schoolId };
    if (search) {
      where.content = { contains: search, mode: 'insensitive' };
    }
    if (tag) {
      where.tags = { contains: tag, mode: 'insensitive' };
    }

    const memories = await db.aiMemory.findMany({
      where,
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
    });
    return NextResponse.json({ memories });
  } catch (error) {
    console.error('Error fetching memories:', error);
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { userId, schoolId, content, category, tags, importance } = await request.json();
    if (!userId || !content?.trim()) {
      return NextResponse.json({ error: 'userId et content requis' }, { status: 400 });
    }
    const memory = await db.aiMemory.create({
      data: {
        userId: auth.userId,
        schoolId: auth.schoolId,
        content: content.trim(),
        category: category || 'fact',
        tags: tags || '',
        importance: importance ?? 5,
      },
    });
    return NextResponse.json({ memory }, { status: 201 });
  } catch (error) {
    console.error('Error creating memory:', error);
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { id, userId, content, category, tags, importance } = await request.json();
    if (!id || !userId) {
      return NextResponse.json({ error: 'id et userId requis' }, { status: 400 });
    }
    const memory = await db.aiMemory.updateMany({
      where: { id, userId: auth.userId },
      data: {
        ...(content !== undefined && { content: content.trim() }),
        ...(category !== undefined && { category }),
        ...(tags !== undefined && { tags }),
        ...(importance !== undefined && { importance }),
      },
    });
    return NextResponse.json({ memory });
  } catch (error) {
    console.error('Error updating memory:', error);
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId');
    const deleteAll = searchParams.get('deleteAll');

    if (deleteAll === 'true' && userId) {
      await db.aiMemory.deleteMany({ where: { userId: auth.userId } });
      return NextResponse.json({ success: true, deleted: 'all' });
    }

    if (!id || !userId) return NextResponse.json({ error: 'id et userId requis' }, { status: 400 });

    await db.aiMemory.deleteMany({ where: { id, userId: auth.userId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting memory:', error);
    return handleApiError(error);
  }
}
