import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import type { AuthUser } from '@/lib/auth/authenticate';
import { handleApiError, ApiError } from '@/lib/api/errors';

export const runtime = 'nodejs';

async function assertHost(meetingId: string, userId: string) {
  if (!userId) return false;
  const p = await db.participant.findFirst({
    where: { meetingId, userId, status: 'approved', role: { in: ['HOST', 'COHOST'] } },
  });
  return !!p;
}

type MeetingInfo = { schoolId: string; creatorId: string; targetRole: string; targetClassId: string };

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

    const meeting = await db.videoConference.findUnique({ where: { id } });
    if (!meeting) {
      return NextResponse.json({ error: 'Réunion introuvable.' }, { status: 404 });
    }
    assertSchool(auth, meeting.schoolId);
    if (!(await isMeetingMember(meeting, auth))) {
      throw new ApiError('Accès refusé : vous n’êtes pas autorisé à consulter cette réunion.', 403, 'MEMBER_FORBIDDEN');
    }

    const participants = await db.participant.findMany({
      where: { meetingId: id },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ participants });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    const body = await req.json();
    const { fullName } = body;

    const meeting = await db.videoConference.findUnique({ where: { id } });
    if (!meeting) {
      return NextResponse.json({ error: 'Réunion introuvable.' }, { status: 404 });
    }
    // Multi-tenant : pas d'inscription à une réunion d'une autre école.
    assertSchool(auth, meeting.schoolId);
    if (meeting.isLocked) {
      return NextResponse.json({ error: 'La salle est verrouillée.', status: 'locked' }, { status: 423 });
    }
    if (meeting.status === 'ended') {
      return NextResponse.json({ error: 'La réunion est terminée.' }, { status: 410 });
    }

    // L'identité vient de la session (un admin peut inscrire un autre utilisateur).
    const userId =
      auth.role === 'ADMIN' && typeof body.userId === 'string' && body.userId ? body.userId : auth.userId;
    const displayName =
      userId === auth.userId ? auth.name || fullName || 'Participant' : fullName || 'Participant';

    const existing = await db.participant.findFirst({ where: { meetingId: id, userId } });
    if (existing) {
      if (existing.status === 'removed' || existing.status === 'rejected') {
        const updated = await db.participant.update({
          where: { id: existing.id },
          data: { status: 'pending', leftAt: null },
        });
        return NextResponse.json({ participant: updated });
      }
      return NextResponse.json({ participant: existing });
    }

    const participant = await db.participant.create({
      data: {
        meetingId: id,
        schoolId: meeting.schoolId,
        userId,
        fullName: displayName,
        role: 'PARTICIPANT',
        status: 'pending',
      },
    });

    return NextResponse.json({ participant });
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
    const body = await req.json();
    const { action, participantId } = body;

    const meeting = await db.videoConference.findUnique({ where: { id } });
    if (!meeting) {
      return NextResponse.json({ error: 'Réunion introuvable.' }, { status: 404 });
    }
    assertSchool(auth, meeting.schoolId);

    // Le rôle d'organisateur est vérifié sur la session, jamais sur un userId client.
    const isHost = auth.role === 'ADMIN' || (await assertHost(id, auth.userId));
    if (!isHost) {
      return NextResponse.json({ error: 'Action réservée à l\'organisateur.' }, { status: 403 });
    }

    const participant = await db.participant.findUnique({ where: { id: participantId } });
    if (!participant || participant.meetingId !== id) {
      return NextResponse.json({ error: 'Participant introuvable.' }, { status: 404 });
    }

    let updateData: Record<string, unknown> = {};
    switch (action) {
      case 'approve':
        updateData = { status: 'approved', joinedAt: participant.joinedAt ?? new Date() };
        break;
      case 'reject':
        updateData = { status: 'rejected' };
        break;
      case 'remove':
        updateData = { status: 'removed', leftAt: new Date() };
        break;
      case 'promote':
        updateData = { isCoHost: !participant.isCoHost, role: !participant.isCoHost ? 'COHOST' : 'PARTICIPANT' };
        break;
      default:
        return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
    }

    const updated = await db.participant.update({
      where: { id: participantId },
      data: updateData,
    });

    return NextResponse.json({ participant: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
