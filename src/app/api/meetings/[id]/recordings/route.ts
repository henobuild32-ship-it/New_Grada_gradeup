import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req, ['ADMIN', 'TEACHER']);
    const { id } = await params;
    const body = await req.json();
    const { url, note, durationSeconds } = body;

    const meeting = await db.videoConference.findUnique({ where: { id } });
    if (!meeting) {
      return NextResponse.json({ error: 'Réunion introuvable.' }, { status: 404 });
    }
    assertSchool(auth, meeting.schoolId);

    // Créateur de l'enregistrement = session (jamais un userId client).
    const createdById = auth.userId;

    const isHost =
      auth.role === 'ADMIN' ||
      !!(await db.participant.findFirst({
        where: { meetingId: id, userId: createdById, status: 'approved', role: { in: ['HOST', 'COHOST'] } },
      }));
    if (!isHost) {
      return NextResponse.json({ error: 'Action réservée à l\'organisateur.' }, { status: 403 });
    }

    const recording = await db.recording.create({
      data: {
        meetingId: id,
        schoolId: meeting.schoolId,
        createdById,
        url: url || '',
        note: note || '',
        durationSeconds: Number(durationSeconds) || 0,
      },
    });

    return NextResponse.json({ recording });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(req, ['ADMIN', 'TEACHER']);
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const recordingId = searchParams.get('recordingId');
    if (!recordingId) {
      return NextResponse.json({ error: 'recordingId requis.' }, { status: 400 });
    }

    const meeting = await db.videoConference.findUnique({ where: { id } });
    if (!meeting) {
      return NextResponse.json({ error: 'Réunion introuvable.' }, { status: 404 });
    }
    assertSchool(auth, meeting.schoolId);

    await db.recording.deleteMany({ where: { id: recordingId, meetingId: id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
