import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { auditFromRequest } from '@/lib/api/audit';
import {
  ANNOUNCEMENT_AUDIENCE_LABELS,
  describeAudience,
  isAnnouncementCategory,
  isAnnouncementPriority,
  normalizeAudience,
  validateAudience,
} from '@/lib/announcements/audience';
import {
  buildAudienceWhere,
  createAnnouncementNotifications,
  resolveAnnouncementRecipients,
  validateAudienceTargets,
} from '@/lib/announcements/server';

const createAnnouncementSchema = z.object({
  title: z.string().trim().min(3, 'Le titre doit contenir au moins 3 caractères.').max(160),
  content: z.string().trim().min(1, 'Le message est obligatoire.').max(20000),
  category: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  audienceType: z.string().trim().optional(),
  targetRoles: z.array(z.string()).optional(),
  targetClassIds: z.array(z.string()).optional(),
  targetUserIds: z.array(z.string()).optional(),
  contextClassId: z.string().trim().optional(),
  expiresAt: z.string().trim().optional().nullable(),
});

function isManager(role: string): boolean {
  return role === 'ADMIN' || role === 'LECTEUR';
}

function serializeAnnouncement(
  announcement: Record<string, unknown> & {
    targetClassIds?: string[];
    targetUserIds?: string[];
    reads?: Array<{ userId: string }>;
    _count?: { reads: number };
  },
  viewerId: string,
  classNames: Record<string, string>,
  userNames: Record<string, string>,
  canSeeStats: boolean,
) {
  const read = announcement.reads?.some((entry) => entry.userId === viewerId) ?? false;
  const targetUserNames = canSeeStats
    ? (announcement.targetUserIds ?? []).map((id) => userNames[id]).filter(Boolean)
    : [];

  return {
    id: announcement.id,
    schoolId: announcement.schoolId,
    authorId: announcement.authorId,
    author: announcement.author,
    title: announcement.title,
    content: announcement.content,
    category: announcement.category,
    priority: announcement.priority,
    audienceType: announcement.audienceType,
    targetRoles: announcement.targetRoles ?? [],
    targetClassIds: announcement.targetClassIds ?? [],
    targetUserIds: announcement.targetUserIds ?? [],
    contextClassId: announcement.contextClassId ?? '',
    recipientCount: announcement.recipientCount ?? 0,
    published: announcement.published,
    publishedAt: announcement.publishedAt,
    expiresAt: announcement.expiresAt,
    createdAt: announcement.createdAt,
    updatedAt: announcement.updatedAt,
    read,
    readCount: canSeeStats ? (announcement._count?.reads ?? 0) : 0,
    audienceLabel: describeAudience(
      {
        audienceType: String(announcement.audienceType || 'ALL') as never,
        targetRoles: (announcement.targetRoles as string[] | undefined) ?? [],
        targetClassIds: (announcement.targetClassIds as string[] | undefined) ?? [],
        targetUserIds: (announcement.targetUserIds as string[] | undefined) ?? [],
      },
      classNames,
    ),
    targetClassNames: (announcement.targetClassIds ?? []).map((id) => classNames[id]).filter(Boolean),
    targetUserNames,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') || '';
    const search = (searchParams.get('search') || '').trim();
    const category = (searchParams.get('category') || '').trim();
    const unread = searchParams.get('unread') === 'true';
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 200), 1), 500);

    const manager = isManager(auth.role);
    // L'administration et le lecteur consultent par défaut tous les communiqués
    // de l'école. Les autres rôles voient uniquement leur boîte de réception.
    const inbox = scope === 'inbox' || !manager;

    const where: Prisma.AnnouncementWhereInput = {
      schoolId: auth.schoolId,
      deletedAt: null,
      published: true,
    };
    const and: Prisma.AnnouncementWhereInput[] = [];

    if (inbox) {
      and.push(await buildAudienceWhere(auth));
      and.push({
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      });
    }
    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (category && isAnnouncementCategory(category)) {
      and.push({ category });
    }
    if (unread) {
      and.push({ reads: { none: { userId: auth.userId } } });
    }
    if (and.length > 0) where.AND = and;

    const announcements = await db.announcement.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: limit,
      include: {
        author: { select: { id: true, fullName: true, role: true, photoUrl: true } },
        ...(manager
          ? {
              reads: { select: { userId: true } },
              _count: { select: { reads: true } },
            }
          : {
              reads: { where: { userId: auth.userId }, select: { userId: true } },
            }),
      },
    });

    const allClassIds = [...new Set(announcements.flatMap((item) => item.targetClassIds))];
    const allTargetUserIds = manager
      ? [...new Set(announcements.flatMap((item) => item.targetUserIds))]
      : [];

    const [classes, targetUsers] = await Promise.all([
      allClassIds.length > 0
        ? db.schoolClass.findMany({
            where: { id: { in: allClassIds }, schoolId: auth.schoolId, deletedAt: null },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      allTargetUserIds.length > 0
        ? db.user.findMany({
            where: { id: { in: allTargetUserIds }, schoolId: auth.schoolId },
            select: { id: true, fullName: true, role: true },
          })
        : Promise.resolve([]),
    ]);

    const classNames = Object.fromEntries(classes.map((item) => [item.id, item.name]));
    const userNames = Object.fromEntries(targetUsers.map((item) => [item.id, item.fullName]));

    const serialized = announcements.map((announcement) => serializeAnnouncement(
      announcement as unknown as Record<string, unknown> & {
        targetClassIds?: string[];
        targetUserIds?: string[];
        reads?: Array<{ userId: string }>;
        _count?: { reads: number };
      },
      auth.userId,
      classNames,
      userNames,
      manager,
    ));

    return NextResponse.json({
      announcements: serialized,
      unreadCount: serialized.filter((item) => !item.read).length,
      audienceLabels: ANNOUNCEMENT_AUDIENCE_LABELS,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Seul l’administrateur peut rédiger et envoyer un communiqué.' },
        { status: 403 },
      );
    }

    const parsed = createAnnouncementSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données du communiqué invalides.', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const body = parsed.data;
    const audience = normalizeAudience(body);
    const audienceError = validateAudience(audience);
    if (audienceError) {
      return NextResponse.json({ error: audienceError }, { status: 400 });
    }

    const targetError = await validateAudienceTargets(auth.schoolId, audience);
    if (targetError) {
      return NextResponse.json({ error: targetError }, { status: 400 });
    }

    const category = body.category && isAnnouncementCategory(body.category) ? body.category : 'GENERAL';
    const priority = body.priority && isAnnouncementPriority(body.priority) ? body.priority : 'NORMAL';

    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      const parsedDate = new Date(body.expiresAt);
      if (!Number.isNaN(parsedDate.getTime())) expiresAt = parsedDate;
    }

    const recipients = await resolveAnnouncementRecipients(auth.schoolId, audience);

    const announcement = await db.announcement.create({
      data: {
        schoolId: auth.schoolId,
        authorId: auth.userId,
        title: body.title,
        content: body.content,
        category,
        priority,
        audienceType: audience.audienceType,
        targetRoles: audience.targetRoles,
        targetClassIds: audience.targetClassIds,
        targetUserIds: audience.targetUserIds,
        contextClassId: audience.contextClassId,
        recipientCount: recipients.length,
        published: true,
        publishedAt: new Date(),
        expiresAt,
      },
      include: {
        author: { select: { id: true, fullName: true, role: true, photoUrl: true } },
        _count: { select: { reads: true } },
      },
    });

    try {
      await createAnnouncementNotifications({
        schoolId: auth.schoolId,
        authorId: auth.userId,
        announcementId: announcement.id,
        title: announcement.title,
        content: announcement.content,
        category,
        priority,
        userIds: recipients,
      });
    } catch (notificationError) {
      // Le communiqué reste créé et consultable même si la cloche échoue.
      console.error('[announcements] notifications non créées', notificationError);
    }

    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'ANNOUNCEMENT_CREATE',
      entity: 'Announcement',
      entityId: announcement.id,
      after: {
        title: announcement.title,
        audienceType: audience.audienceType,
        targetRoles: audience.targetRoles,
        targetClassIds: audience.targetClassIds,
        targetUserIds: audience.targetUserIds,
        recipientCount: recipients.length,
      },
    });

    return NextResponse.json(
      {
        announcement: {
          ...announcement,
          read: false,
          readCount: 0,
          audienceLabel: describeAudience(audience),
        },
        recipientCount: recipients.length,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
