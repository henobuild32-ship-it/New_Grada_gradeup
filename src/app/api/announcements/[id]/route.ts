import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { auditFromRequest } from '@/lib/api/audit';
import {
  describeAudience,
  isAnnouncementCategory,
  isAnnouncementPriority,
} from '@/lib/announcements/audience';
import { buildAudienceWhere } from '@/lib/announcements/server';

const updateAnnouncementSchema = z.object({
  title: z.string().trim().min(3, 'Le titre doit contenir au moins 3 caractères.').max(160).optional(),
  content: z.string().trim().min(1, 'Le message est obligatoire.').max(20000).optional(),
  category: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  expiresAt: z.string().trim().optional().nullable(),
});

function isManager(role: string): boolean {
  return role === 'ADMIN' || role === 'LECTEUR';
}

async function findAccessibleAnnouncement(
  id: string,
  auth: Awaited<ReturnType<typeof authenticateRequestActive>>,
) {
  const manager = isManager(auth.role);
  const and: Prisma.AnnouncementWhereInput[] = [];

  if (!manager) {
    and.push(await buildAudienceWhere(auth));
    and.push({ published: true });
    and.push({
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    });
  }

  return db.announcement.findFirst({
    where: {
      id,
      schoolId: auth.schoolId,
      deletedAt: null,
      ...(and.length > 0 ? { AND: and } : {}),
    },
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
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequestActive(request);
    const { id } = await params;
    const announcement = await findAccessibleAnnouncement(id, auth);

    if (!announcement) {
      return NextResponse.json({ error: 'Communiqué introuvable ou non accessible.' }, { status: 404 });
    }

    const manager = isManager(auth.role);
    const [classes, targetUsers] = await Promise.all([
      announcement.targetClassIds.length > 0
        ? db.schoolClass.findMany({
            where: { id: { in: announcement.targetClassIds }, schoolId: auth.schoolId, deletedAt: null },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      manager && announcement.targetUserIds.length > 0
        ? db.user.findMany({
            where: { id: { in: announcement.targetUserIds }, schoolId: auth.schoolId },
            select: { id: true, fullName: true, role: true },
          })
        : Promise.resolve([]),
    ]);

    const classNames = Object.fromEntries(classes.map((item) => [item.id, item.name]));
    const userNames = Object.fromEntries(targetUsers.map((item) => [item.id, item.fullName]));
    const read = announcement.reads?.some((entry) => entry.userId === auth.userId) ?? false;

    return NextResponse.json({
      announcement: {
        ...announcement,
        read,
        readCount: manager ? ((announcement as { _count?: { reads?: number } })._count?.reads ?? 0) : 0,
        audienceLabel: describeAudience(
          {
            audienceType: announcement.audienceType as never,
            targetRoles: announcement.targetRoles,
            targetClassIds: announcement.targetClassIds,
            targetUserIds: announcement.targetUserIds,
          },
          classNames,
        ),
        targetClassNames: announcement.targetClassIds.map((classId) => classNames[classId]).filter(Boolean),
        targetUserNames: manager
          ? announcement.targetUserIds.map((userId) => userNames[userId]).filter(Boolean)
          : [],
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Seul l’administrateur peut modifier un communiqué.' },
        { status: 403 },
      );
    }

    const { id } = await params;
    const existing = await db.announcement.findFirst({
      where: { id, schoolId: auth.schoolId, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Communiqué introuvable.' }, { status: 404 });
    }

    const parsed = updateAnnouncementSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données du communiqué invalides.', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const body = parsed.data;
    const data: Prisma.AnnouncementUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.content !== undefined) data.content = body.content;
    if (body.category !== undefined && isAnnouncementCategory(body.category)) data.category = body.category;
    if (body.priority !== undefined && isAnnouncementPriority(body.priority)) data.priority = body.priority;
    if (body.expiresAt !== undefined) {
      if (body.expiresAt === null || body.expiresAt === '') {
        data.expiresAt = null;
      } else {
        const parsedDate = new Date(body.expiresAt);
        if (!Number.isNaN(parsedDate.getTime())) data.expiresAt = parsedDate;
      }
    }

    const updated = await db.announcement.update({
      where: { id: existing.id },
      data,
      include: {
        author: { select: { id: true, fullName: true, role: true, photoUrl: true } },
        _count: { select: { reads: true } },
      },
    });

    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'ANNOUNCEMENT_UPDATE',
      entity: 'Announcement',
      entityId: updated.id,
      before: { title: existing.title, content: existing.content, category: existing.category, priority: existing.priority },
      after: { title: updated.title, content: updated.content, category: updated.category, priority: updated.priority },
    });

    return NextResponse.json({ announcement: updated });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Seul l’administrateur peut retirer un communiqué.' },
        { status: 403 },
      );
    }

    const { id } = await params;
    const existing = await db.announcement.findFirst({
      where: { id, schoolId: auth.schoolId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Communiqué introuvable.' }, { status: 404 });
    }

    await db.announcement.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), published: false },
    });

    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'ANNOUNCEMENT_DELETE',
      entity: 'Announcement',
      entityId: existing.id,
      before: { title: existing.title },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
