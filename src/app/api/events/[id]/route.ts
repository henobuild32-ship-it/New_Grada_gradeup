import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError, ApiError, assertFound } from '@/lib/api/errors';
import { ok } from '@/lib/api/response';
import { eventSchema, parseOrThrow } from '@/lib/validation/entities';
import { auditFromRequest } from '@/lib/api/audit';

export const runtime = 'nodejs';

async function loadEvent(id: string) {
  return assertFound(await db.event.findUnique({ where: { id } }), 'Événement introuvable.');
}

function assertCreatorOrAdmin(auth: { userId: string; role: string }, createdById: string): void {
  if (auth.role === 'ADMIN' || createdById === auth.userId) return;
  throw new ApiError('Accès refusé : réservé au créateur ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    const { id } = await params;
    const event = await loadEvent(id);
    assertSchool(auth, event.schoolId);
    return ok('event', event);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, ['ADMIN', 'TEACHER']);
    const { id } = await params;
    const event = await loadEvent(id);
    assertSchool(auth, event.schoolId);
    assertCreatorOrAdmin(auth, event.createdById);

    const body = await req.json();
    const data = parseOrThrow(eventSchema, body);

    const updated = await db.event.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description ?? event.description,
        startsAt: data.startsAt,
        endsAt: data.endsAt ?? event.endsAt,
        location: data.location ?? event.location,
        targetType: data.targetType ?? event.targetType,
        targetClassId: data.targetClassId || event.targetClassId,
        version: { increment: 1 },
      },
    });

    await auditFromRequest(req, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'UPDATE',
      entity: 'Event',
      entityId: id,
      before: event,
      after: updated,
    });

    return ok('event', updated);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, ['ADMIN', 'TEACHER']);
    const { id } = await params;
    const event = await loadEvent(id);
    assertSchool(auth, event.schoolId);
    assertCreatorOrAdmin(auth, event.createdById);

    const deleted = await db.event.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });

    await auditFromRequest(req, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'DELETE',
      entity: 'Event',
      entityId: id,
      before: event,
    });

    return ok('event', deleted);
  } catch (e) {
    return handleApiError(e);
  }
}
