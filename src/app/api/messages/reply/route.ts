import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifyUser } from '@/services/notifications/notificationEngine';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError, ApiError } from '@/lib/api/errors';

export const runtime = 'nodejs';

// POST /api/messages/reply — Reply to a message
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    const { senderId, recipientId, content, schoolId, replyToId } = await request.json();
    if (!senderId || !recipientId || !content?.trim() || !schoolId || !replyToId) {
      return NextResponse.json(
        { error: 'senderId, recipientId, content, schoolId, replyToId requis' },
        { status: 400 }
      );
    }

    // Verify the original message exists
    const originalMessage = await db.message.findUnique({ where: { id: replyToId } });
    if (!originalMessage) {
      return NextResponse.json({ error: 'Message original non trouvé' }, { status: 404 });
    }

    // Seul un participant de la conversation d'origine peut y répondre.
    const isParticipant =
      originalMessage.senderId === auth.userId || originalMessage.recipientId === auth.userId;
    if (!isParticipant) {
      throw new ApiError('Non autorisé', 403, 'OWNERSHIP_FORBIDDEN');
    }

    // Expéditeur, destinataire (contrepartie du message d'origine) et école
    // sont imposés par la session.
    const replyRecipientId =
      originalMessage.senderId === auth.userId
        ? originalMessage.recipientId
        : originalMessage.senderId;

    const message = await db.message.create({
      data: {
        schoolId: auth.schoolId,
        senderId: auth.userId,
        recipientId: replyRecipientId,
        content: content.trim(),
        replyToId,
      },
      include: {
        sender: { select: { id: true, fullName: true, photoUrl: true, role: true } },
        recipient: { select: { id: true, fullName: true, photoUrl: true, role: true } },
        replyTo: {
          include: { sender: { select: { id: true, fullName: true } } },
        },
      },
    });

    // Notify recipient
    try {
      await notifyUser({
        schoolId: auth.schoolId,
        userId: replyRecipientId,
        title: 'Nouvelle réponse',
        message: `Vous avez reçu une réponse de ${message.sender.fullName}`,
        type: 'MESSAGE',
      });
    } catch { /* non-blocking */ }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error('Error replying to message:', error);
    return handleApiError(error);
  }
}
