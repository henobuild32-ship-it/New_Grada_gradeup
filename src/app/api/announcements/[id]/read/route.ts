import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { buildAudienceWhere } from '@/lib/announcements/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateRequestActive(request);
    const { id } = await params;

    const manager = auth.role === 'ADMIN' || auth.role === 'LECTEUR';
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

    const announcement = await db.announcement.findFirst({
      where: {
        id,
        schoolId: auth.schoolId,
        deletedAt: null,
        ...(and.length > 0 ? { AND: and } : {}),
      },
      select: { id: true },
    });

    if (!announcement) {
      return NextResponse.json({ error: 'Communiqué introuvable ou non accessible.' }, { status: 404 });
    }

    await db.announcementRead.upsert({
      where: {
        announcementId_userId: {
          announcementId: announcement.id,
          userId: auth.userId,
        },
      },
      update: {},
      create: {
        announcementId: announcement.id,
        userId: auth.userId,
        schoolId: auth.schoolId,
      },
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
