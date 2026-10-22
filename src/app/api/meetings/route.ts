import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { randomUUID } from 'crypto';
import { notifyUser } from '@/services/notifications/notificationEngine';
import { requireAuth } from '@/lib/api/rbac';
import type { AuthUser } from '@/lib/auth/authenticate';
import { handleApiError } from '@/lib/api/errors';

export const runtime = 'nodejs';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function nowTimeStr(): string {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

async function isMeetingVisibleToUser(
  meeting: { targetRole: string; targetClassId: string; creatorId: string },
  auth: AuthUser
): Promise<boolean> {
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

export async function GET(req: NextRequest) {
  try {
    // Session = vérité : schoolId/userId/rôle proviennent du jeton, jamais du client.
    const auth = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') || 'upcoming'; // upcoming | live | past | all
    const schoolId = auth.schoolId;

    const meetings = await db.videoConference.findMany({
      where: { schoolId },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      include: {
        participants: { orderBy: { createdAt: 'asc' } },
        recordings: { orderBy: { createdAt: 'desc' } },
      },
    });

    const filtered: any[] = [];
    for (const m of meetings) {
      if (!(await isMeetingVisibleToUser(m, auth))) continue;

      if (scope === 'live') {
        if (m.status !== 'live') continue;
      } else if (scope === 'past') {
        if (m.status !== 'ended') continue;
      } else if (scope === 'upcoming') {
        if (m.status === 'ended') continue;
      }

      filtered.push(m);
    }

    return NextResponse.json({ meetings: filtered });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['ADMIN', 'TEACHER']);
    const data = await req.json();
    const { title, description, date, time, targetRole, targetClassId, type } = data;

    const schoolId = auth.schoolId;
    const creatorId = auth.userId;
    const creatorName = data.creatorName || auth.name || 'Organisateur';

    if (!title) {
      return NextResponse.json({ error: 'title est requis.' }, { status: 400 });
    }

    const isInstant = type === 'instant';
    const meetingDate = isInstant ? todayStr() : date;
    const meetingTime = isInstant ? nowTimeStr() : time;

    if (!isInstant && (!meetingDate || !meetingTime)) {
      return NextResponse.json({ error: 'date et time sont requis pour une réunion programmée.' }, { status: 400 });
    }

    const roomId = `GradeUp-${schoolId.substring(0, 5)}-${randomUUID().substring(0, 8)}`;
    const roomUrl = `https://meet.jit.si/${roomId}`;

    const meeting = await db.videoConference.create({
      data: {
        schoolId,
        title,
        description: description || '',
        date: meetingDate,
        time: meetingTime,
        roomUrl,
        targetRole: targetRole || 'ALL',
        targetClassId: targetClassId || '',
        type: isInstant ? 'instant' : 'scheduled',
        status: isInstant ? 'live' : 'scheduled',
        isLocked: false,
        creatorId,
        startedAt: isInstant ? new Date() : null,
      },
    });

    await db.participant.create({
      data: {
        meetingId: meeting.id,
        schoolId,
        userId: creatorId,
        fullName: creatorName,
        role: 'HOST',
        status: 'approved',
        isCoHost: false,
        joinedAt: isInstant ? new Date() : null,
      },
    });

    if (!isInstant) {
      try { await notifyUser({
        schoolId,
        senderId: creatorId,
        targetRole: targetRole || 'ALL',
        targetClassId: targetClassId || '',
        message: `Nouvelle visioconférence : "${title}" le ${meetingDate} à ${meetingTime}.`,
        title: 'Nouvelle Visioconférence 🎥',
        type: 'CONFERENCE',
        priority: 'HIGH',
        metadata: { conferenceId: meeting.id, roomUrl, date: meetingDate, time: meetingTime },
      }); } catch (e) { console.error('[Meetings] Notification failed (non-blocking):', e); }
    }

    return NextResponse.json({ meeting });
  } catch (error) {
    return handleApiError(error);
  }
}
