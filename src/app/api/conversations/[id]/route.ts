import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError, ApiError, assertFound } from '@/lib/api/errors';
import { ok } from '@/lib/api/response';

export const runtime = 'nodejs';

async function loadConversation(id: string) {
  return assertFound(
    await db.conversation.findUnique({
      where: { id },
      include: {
        participants: {
          include: { user: { select: { id: true, fullName: true, role: true } } },
        },
      },
    }),
    'Conversation introuvable.'
  );
}

function shape(c: {
  id: string;
  type: string;
  title: string;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  participants: { user: { id: string; fullName: string; role: string } }[];
}) {
  return {
    id: c.id,
    type: c.type,
    title: c.title,
    lastMessageAt: c.lastMessageAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    participants: c.participants.map((p) => ({
      id: p.user.id,
      fullName: p.user.fullName,
      role: p.user.role,
    })),
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    const { id } = await params;
    const conversation = await loadConversation(id);
    assertSchool(auth, conversation.schoolId);
    const isParticipant = conversation.participants.some((p) => p.user.id === auth.userId);
    if (!isParticipant) throw new ApiError('Accès refusé : vous n’êtes pas participant.', 403, 'OWNERSHIP_FORBIDDEN');
    return ok('conversation', shape(conversation));
  } catch (e) {
    return handleApiError(e);
  }
}

/** PATCH — ajoute un participant (ADMIN ou OWNER de la conversation). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    const { id } = await params;
    const conversation = await loadConversation(id);
    assertSchool(auth, conversation.schoolId);

    const me = conversation.participants.find((p) => p.user.id === auth.userId);
    const isOwner = me?.role === 'OWNER';
    if (auth.role !== 'ADMIN' && !isOwner) {
      throw new ApiError('Accès refusé : réservé au créateur ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
    }

    const body = await req.json();
    const userIds: unknown = body?.userIds ?? body?.participantIds;
    if (!Array.isArray(userIds) || userIds.length === 0 || !userIds.every((u) => typeof u === 'string')) {
      throw new ApiError('userIds : tableau d’identifiants requis.', 400, 'VALIDATION_ERROR');
    }

    const existing = new Set(conversation.participants.map((p) => p.user.id));
    const toAdd = (userIds as string[]).filter((u) => !existing.has(u));
    if (toAdd.length === 0) {
      return ok('conversation', shape(conversation), { added: 0 });
    }

    const users = await db.user.findMany({
      where: { id: { in: toAdd }, schoolId: auth.schoolId, deletedAt: null },
      select: { id: true },
    });
    if (users.length !== toAdd.length) {
      throw new ApiError('Certains utilisateurs sont introuvables dans l’établissement.', 404, 'NOT_FOUND');
    }

    await db.conversationParticipant.createMany({
      data: users.map((u) => ({ conversationId: id, userId: u.id, role: 'MEMBER' })),
      skipDuplicates: true,
    });

    const updated = await loadConversation(id);
    return ok('conversation', shape(updated), { added: users.length });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    const { id } = await params;
    const conversation = await loadConversation(id);
    assertSchool(auth, conversation.schoolId);

    const me = conversation.participants.find((p) => p.user.id === auth.userId);
    const isOwner = me?.role === 'OWNER';
    if (auth.role !== 'ADMIN' && !isOwner) {
      throw new ApiError('Accès refusé : réservé au créateur ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
    }

    const deleted = await db.conversation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return ok('conversation', { id: deleted.id, deletedAt: deleted.deletedAt });
  } catch (e) {
    return handleApiError(e);
  }
}
