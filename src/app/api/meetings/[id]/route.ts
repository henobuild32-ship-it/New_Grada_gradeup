import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import type { AuthUser } from '@/lib/auth/authenticate';
import { handleApiError, ApiError } from '@/lib/api/errors';

export const runtime = 'nodejs';

type MeetingInfo = { schoolId: string; creatorId: string; targetRole: string; targetClassId: string };

/** Membre autorisé : admin, créateur, rôle ciblé, ou inscrit à la classe ciblée. */
async function isMeetingMember(meeting: MeetingInfo, auth: AuthUser): Promise<boolean> {
  if (auth.role === 'ADMIN') return true;
  if (meeting.creatorId && meeting.creatorId === auth.userId) return true;
  if (meeting.targetRole !== 'ALL' && meeting.targetRole !== auth.role) return false;
  if (meeting.targetClassId) {
    const enrollment = await db.enrolledClass.findFirst({
      where: { userId: auth.userId, classId: meeting.targetClassId },
    });
    if (!enrollment) return false;
  }
  return true;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    const meeting = await db.videoConference.findUnique({
      where: { id },
      include: {
        participants: { orderBy: { createdAt: 'asc' } },
        recordings: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: 'Réunion introuvable.' }, { status: 404 });
    }
    assertSchool(auth, meeting.schoolId);
    if (!(await isMeetingMember(meeting, auth))) {
      throw new ApiError('Accès refusé : vous n’êtes pas autorisé à consulter cette réunion.', 403, 'MEMBER_FORBIDDEN');
    }

    return NextResponse.json({ meeting });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    const data = await req.json();
    const { title, description, isLocked, status } = data;

    const existing = await db.videoConference.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Réunion introuvable.' }, { status: 404 });
    }
    assertSchool(auth, existing.schoolId);
    if (auth.role !== 'ADMIN' && existing.creatorId !== auth.userId) {
      throw new ApiError('Accès refusé : seul l’organisateur ou l’administration peut modifier cette réunion.', 403, 'OWNERSHIP_FORBIDDEN');
    }

    const updateData: Record<string, unknown> = {};
    if (typeof title === 'string') updateData.title = title;
    if (typeof description === 'string') updateData.description = description;
    if (typeof isLocked === 'boolean') updateData.isLocked = isLocked;
    if (typeof status === 'string') {
      updateData.status = status;
      if (status === 'live' && !existing.startedAt) updateData.startedAt = new Date();
      if (status === 'ended') updateData.endedAt = new Date();
    }

    const meeting = await db.videoConference.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ meeting });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);

    const existing = await db.videoConference.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Réunion introuvable.' }, { status: 404 });
    }
    assertSchool(auth, existing.schoolId);
    if (auth.role !== 'ADMIN' && existing.creatorId !== auth.userId) {
      throw new ApiError('Accès refusé : seul l’organisateur ou l’administration peut supprimer cette réunion.', 403, 'OWNERSHIP_FORBIDDEN');
    }

    await db.videoConference.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
