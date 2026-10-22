import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError, ApiError, assertFound } from '@/lib/api/errors';

// DELETE /api/user/data?userId=xxx
// Supprime toutes les conversations, messages et documents IA de l'utilisateur.

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    if (userId !== auth.userId) {
      if (auth.role !== 'ADMIN') {
        throw new ApiError(
          'Accès refusé : suppression réservée au propriétaire ou à l’administration.',
          403,
          'OWNERSHIP_FORBIDDEN'
        );
      }
      const target = assertFound(
        await db.user.findUnique({ where: { id: userId }, select: { schoolId: true } }),
        'Utilisateur introuvable.'
      );
      assertSchool(auth, target.schoolId);
    }

    // La suppression en cascade (AiMessage, AiDocument) est gérée par Prisma (onDelete: Cascade)
    await db.aiConversation.deleteMany({ where: { userId } });

    return NextResponse.json({
      success: true,
      message: 'Toutes vos conversations et données Gradie ont été supprimées.',
    });
  } catch (error) {
    console.error('Error deleting user data:', error);
    return handleApiError(error);
  }
}
