import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { uploadFile } from '@/lib/storage';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { notifyUser } from '@/services/notifications/notificationEngine';

export const runtime = 'nodejs';
export const maxDuration = 30;

function hasExpectedSignature(mime: string, bytes: Buffer): boolean {
  const startsWith = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  const asciiAt = (value: string, offset = 0) => bytes.subarray(offset, offset + value.length).toString('ascii') === value;
  const isZip = startsWith(0x50, 0x4b) && [0x03, 0x05, 0x07].includes(bytes[2]) && [0x04, 0x06, 0x08].includes(bytes[3]);
  const isOle = startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  const zipHasEntries = (required: string[]) => {
    if (!isZip) return false;
    const endSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
    const endOffset = bytes.lastIndexOf(endSignature, Math.max(0, bytes.length - 22));
    if (endOffset < 0 || endOffset + 22 > bytes.length) return false;
    const directoryOffset = bytes.readUInt32LE(endOffset + 16);
    const directorySize = bytes.readUInt32LE(endOffset + 12);
    const directoryEnd = directoryOffset + directorySize;
    if (directoryOffset > bytes.length || directoryEnd > endOffset) return false;
    const entries = new Set<string>();
    for (let offset = directoryOffset; offset + 46 <= directoryEnd;) {
      if (bytes.readUInt32LE(offset) !== 0x02014b50) return false;
      const nameLength = bytes.readUInt16LE(offset + 28);
      const extraLength = bytes.readUInt16LE(offset + 30);
      const commentLength = bytes.readUInt16LE(offset + 32);
      const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
      if (entryEnd > directoryEnd) return false;
      entries.add(bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
      offset = entryEnd;
    }
    return required.every((entry) => entries.has(entry));
  };

  switch (mime) {
    case 'image/jpeg': return startsWith(0xff, 0xd8, 0xff);
    case 'image/png': return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/webp': return asciiAt('RIFF') && asciiAt('WEBP', 8);
    case 'image/gif': return asciiAt('GIF87a') || asciiAt('GIF89a');
    case 'application/pdf': return asciiAt('%PDF-');
    case 'text/plain':
    case 'text/csv':
      return !bytes.includes(0) && !bytes.some((byte) => byte < 0x09 || (byte > 0x0d && byte < 0x20));
    case 'application/msword':
    case 'application/vnd.ms-excel':
    case 'application/vnd.ms-powerpoint': return isOle;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return zipHasEntries(['[Content_Types].xml', 'word/document.xml']);
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return zipHasEntries(['[Content_Types].xml', 'xl/workbook.xml']);
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return zipHasEntries(['[Content_Types].xml', 'ppt/presentation.xml']);
    case 'video/mp4':
    case 'video/quicktime':
    case 'audio/mp4': return bytes.length >= 12 && asciiAt('ftyp', 4);
    case 'video/webm': return startsWith(0x1a, 0x45, 0xdf, 0xa3);
    case 'audio/webm': return startsWith(0x1a, 0x45, 0xdf, 0xa3);
    case 'audio/mpeg': return asciiAt('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    case 'audio/wav': return asciiAt('RIFF') && asciiAt('WAVE', 8);
    case 'audio/ogg': return asciiAt('OggS');
    default: return false;
  }
}

// POST /api/upload/message — Upload a file for messaging
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN' && auth.role !== 'LECTEUR') {
      return NextResponse.json({ error: 'Cette messagerie est réservée à l’administration et au Lecteur.' }, { status: 403 });
    }
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const recipientId = formData.get('recipientId') as string;
    const caption = typeof formData.get('content') === 'string' ? String(formData.get('content')).trim() : '';
    const senderId = auth.userId;

    if (!file || !recipientId) {
      return NextResponse.json(
        { error: 'Fichier et destinataire requis.' },
        { status: 400 }
      );
    }
    if (caption.length > 5000) return NextResponse.json({ error: 'La légende est trop longue (max 5 000 caractères).' }, { status: 400 });

    const recipient = await db.user.findFirst({
      where: { id: recipientId, schoolId: auth.schoolId, active: true, deletedAt: null },
      select: { id: true, role: true },
    });
    if (!recipient) return NextResponse.json({ error: 'Destinataire introuvable dans votre école.' }, { status: 404 });
    if (auth.role === 'LECTEUR' && recipient.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Le Lecteur peut uniquement écrire à l’administrateur de son école.' }, { status: 403 });
    }

    const allowedTypes = new Set([
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf', 'text/plain', 'text/csv',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm',
    ]);
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Le fichier doit peser entre 1 octet et 25 Mo.' }, { status: 400 });
    }
    if (!allowedTypes.has(file.type.toLowerCase())) {
      return NextResponse.json({ error: 'Type de fichier non accepté. Utilisez une image, un document, une vidéo MP4/WebM ou un audio courant.' }, { status: 415 });
    }

    const fileType = file.type.toLowerCase();
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    if (!hasExpectedSignature(fileType, buffer)) {
      return NextResponse.json({ error: 'Le contenu du fichier ne correspond pas au format annoncé.' }, { status: 415 });
    }
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `messages/${randomUUID()}.${ext}`;

    const { url } = await uploadFile(buffer, path, fileType);
    const safeName = file.name.replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim().slice(0, 180) || 'Fichier';

    // Create message with attachment
    const message = await db.message.create({
      data: {
        schoolId: auth.schoolId,
        senderId,
        recipientId,
        content: caption || safeName,
        messageType: fileType.startsWith('image/') ? 'image' : fileType.startsWith('video/') ? 'video' : fileType.startsWith('audio/') ? 'audio' : 'file',
        attachmentUrl: url,
        attachmentName: safeName,
        attachmentType: fileType,
      },
      include: {
        sender: { select: { id: true, fullName: true, photoUrl: true, role: true } },
        recipient: { select: { id: true, fullName: true, photoUrl: true, role: true } },
      },
    });

    await notifyUser({
      schoolId: auth.schoolId,
      senderId: auth.userId,
      userId: recipientId,
      targetRole: recipient.role,
      title: `Pièce jointe de ${message.sender?.fullName || 'un utilisateur'}`,
      message: (caption || safeName).slice(0, 120),
      type: 'MESSAGE',
      priority: 'NORMAL',
      metadata: { messageId: message.id, logo: '/logo-gradeup.png' },
    }).catch(() => undefined);

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Error uploading message file:', error);
    return NextResponse.json({ error: "Impossible d'envoyer le fichier. Vérifiez votre connexion puis réessayez." }, { status: 500 });
  }
}
