import { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError, ApiError } from '@/lib/api/errors';
import { parseListParams, list, created } from '@/lib/api/response';

export const runtime = 'nodejs';

const createConversationSchema = z.object({
  participantIds: z.array(z.string().min(1)).min(1).max(50),
  title: z.string().max(200).optional(),
  type: z.enum(['PRIVATE', 'GROUP']).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const pagination = parseListParams(searchParams, { lastMessageAt: 'desc' });

    const where: any = {
      schoolId: auth.schoolId,
      deletedAt: null,
      participants: { some: { userId: auth.userId } },
    };

    const [total, rows] = await Promise.all([
      db.conversation.count({ where }),
      db.conversation.findMany({
        where,
        orderBy: pagination.orderBy,
        skip: pagination.skip,
        take: pagination.take,
        include: {
          participants: {
            include: {
              user: { select: { id: true, fullName: true, role: true } },
            },
          },
        },
      }),
    ]);

    return list(
      'conversation',
      rows.map((c) => ({
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
      })),
      { page: pagination.page, pageSize: pagination.pageSize, total, totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)) }
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json();
    const data = parseCreate(body);

    const otherIds = [...new Set(data.participantIds)].filter((id) => id !== auth.userId);
    if (otherIds.length === 0) {
      throw new ApiError('Au moins un autre participant requis.', 400, 'BAD_REQUEST');
    }

    // Tous les participants doivent appartenir à la même école
    const users = await db.user.findMany({
      where: { id: { in: [...otherIds, auth.userId] }, schoolId: auth.schoolId, deletedAt: null },
      select: { id: true },
    });
    const userIds = new Set(users.map((u) => u.id));
    for (const id of otherIds) {
      if (!userIds.has(id)) {
        throw new ApiError(`Utilisateur introuvable dans l’établissement : ${id}.`, 404, 'NOT_FOUND');
      }
    }

    const type = data.type ?? (otherIds.length === 1 ? 'PRIVATE' : 'GROUP');

    // Réutilise une conversation PRIVATE existante entre les 2 mêmes users
    if (type === 'PRIVATE' && otherIds.length === 1) {
      const otherId = otherIds[0];
      const existing = await db.conversation.findFirst({
        where: {
          schoolId: auth.schoolId,
          type: 'PRIVATE',
          deletedAt: null,
          AND: [
            { participants: { some: { userId: auth.userId } } },
            { participants: { some: { userId: otherId } } },
          ],
        },
        include: {
          participants: {
            include: { user: { select: { id: true, fullName: true, role: true } } },
          },
        },
      });
      if (existing) {
        return created('conversation', {
          id: existing.id,
          type: existing.type,
          title: existing.title,
          lastMessageAt: existing.lastMessageAt,
          participants: existing.participants.map((p) => ({
            id: p.user.id,
            fullName: p.user.fullName,
            role: p.user.role,
          })),
        });
      }
    }

    const conversation = await db.conversation.create({
      data: {
        schoolId: auth.schoolId,
        type,
        title: data.title || '',
        participants: {
          create: [
            { userId: auth.userId, role: 'OWNER' },
            ...otherIds.map((id) => ({ userId: id, role: 'MEMBER' })),
          ],
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, fullName: true, role: true } } },
        },
      },
    });

    return created('conversation', {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      lastMessageAt: conversation.lastMessageAt,
      participants: conversation.participants.map((p) => ({
        id: p.user.id,
        fullName: p.user.fullName,
        role: p.user.role,
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

function parseCreate(body: unknown) {
  const result = createConversationSchema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ApiError(
      issue ? `${issue.path.join('.') || '(corps)'} : ${issue.message}` : 'Données invalides.',
      400,
      'VALIDATION_ERROR'
    );
  }
  return result.data;
}
