import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireActiveAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';
import { notifyUser } from '@/services/notifications/notificationEngine';

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireActiveAuth(request, ['TEACHER', 'ADMIN']);
    const body = await request.json();
    const { transmissionId, action } = body; // action: 'RECEIVE' | 'REJECT'
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : '';

    if (typeof transmissionId !== 'string' || !['RECEIVE', 'REJECT'].includes(action)) {
      return NextResponse.json({ error: 'transmissionId et action RECEIVE ou REJECT requis' }, { status: 400 });
    }

    const transmission = await db.cotationTransmission.findUnique({
      where: { id: transmissionId },
      include: {
        evaluation: {
          include: {
            class: { select: { id: true, name: true } },
            course: { select: { id: true, name: true } },
          },
        },
        teacher: { select: { id: true, fullName: true } },
        class: { select: { id: true, name: true } },
      },
    });

    if (!transmission) {
      return NextResponse.json({ error: 'Transmission introuvable' }, { status: 404 });
    }

    // Multi-tenant : la transmission doit appartenir à l'école de la session
    assertSchool(auth, transmission.schoolId);

    // Vérifier que l'utilisateur est bien le titulaire
    if (auth.role !== 'ADMIN' && transmission.titulaireId !== auth.userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }
    if (!['SENT', 'RESENT'].includes(transmission.status)) {
      return NextResponse.json({ error: 'Cette transmission a déjà été traitée ou doit d’abord être renvoyée par le professeur.' }, { status: 409 });
    }

    if (action === 'RECEIVE') {
      await db.cotationTransmission.update({
        where: { id: transmissionId },
        data: {
          status: 'RECEIVED',
          receivedAt: new Date(),
        },
      });

      // Notification au professeur expéditeur
      await notifyUser({
        schoolId: transmission.schoolId,
        userId: transmission.teacherId,
        senderId: auth.userId,
        title: 'Cotations validées par le titulaire',
        message: `Le titulaire a validé les cotations « ${transmission.evaluation.title} » (${transmission.evaluation.course.name}).`,
        type: 'COTATION_RECEIVED',
        priority: 'NORMAL',
        metadata: { evaluationId: transmission.evaluationId, transmissionId },
      });
    } else if (action === 'REJECT') {
      await db.cotationTransmission.update({
        where: { id: transmissionId },
        data: { status: 'REJECTED', notes },
      });
      await notifyUser({
        schoolId: transmission.schoolId,
        userId: transmission.teacherId,
        senderId: auth.userId,
        title: 'Cotations à corriger',
        message: notes
          ? `Le titulaire demande une correction pour « ${transmission.evaluation.title} » : ${notes}`
          : `Le titulaire demande une correction pour « ${transmission.evaluation.title} ». Consultez le cahier et renvoyez-le.`,
        type: 'COTATION',
        priority: 'HIGH',
        metadata: { evaluationId: transmission.evaluationId, transmissionId, action: 'REJECT' },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
