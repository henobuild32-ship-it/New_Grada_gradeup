import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { auditFromRequest } from '@/lib/api/audit';
import { notifyUser } from '@/services/notifications/notificationEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sendSchema = z.object({ content: z.string().trim().min(1).max(5000) }).strict();

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'LECTEUR') return NextResponse.json({ error: 'Accès réservé au Lecteur.' }, { status: 403 });

    const admin = await db.user.findFirst({
      where: { schoolId: auth.schoolId, role: 'ADMIN', active: true, deletedAt: null },
      select: { id: true, fullName: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!admin) return NextResponse.json({ admin: null, messages: [] });

    const messages = await db.message.findMany({
      where: {
        schoolId: auth.schoolId,
        OR: [
          { senderId: auth.userId, recipientId: admin.id },
          { senderId: admin.id, recipientId: auth.userId },
        ],
      },
      select: {
        id: true,
        senderId: true,
        content: true,
        read: true,
        createdAt: true,
        messageType: true,
        attachmentUrl: true,
        attachmentName: true,
        attachmentType: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return NextResponse.json({ admin, messages }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Impossible de charger la conversation.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'LECTEUR') return NextResponse.json({ error: 'Accès réservé au Lecteur.' }, { status: 403 });
    const parsed = sendSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Le message doit contenir entre 1 et 5 000 caractères.' }, { status: 400 });

    const admin = await db.user.findFirst({
      where: { schoolId: auth.schoolId, role: 'ADMIN', active: true, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!admin) return NextResponse.json({ error: 'Aucun administrateur actif ne peut recevoir ce message.' }, { status: 409 });

    const message = await db.message.create({
      data: { schoolId: auth.schoolId, senderId: auth.userId, recipientId: admin.id, content: parsed.data.content },
      select: { id: true, senderId: true, content: true, read: true, createdAt: true },
    });
    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'LECTEUR_MESSAGE_SENT',
      entity: 'Message',
      entityId: message.id,
    });
    await notifyUser({
      schoolId: auth.schoolId,
      senderId: auth.userId,
      userId: admin.id,
      targetRole: 'ADMIN',
      title: 'Nouveau message du Lecteur',
      message: parsed.data.content.slice(0, 120),
      type: 'MESSAGE',
      priority: 'HIGH',
      metadata: { messageId: message.id, logo: '/logo-gradeup.png' },
    }).catch(() => undefined);

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Le message n’a pas pu être envoyé. Réessayez.' }, { status: 500 });
  }
}
