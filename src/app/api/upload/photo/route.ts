import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/authenticate';
import { uploadFile } from '@/lib/storage';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(req: NextRequest) {
  try {
    const auth = authenticateRequest(req);
    if (!auth?.userId) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('photo') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier' }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Format d\'image non accepté. Formats autorisés : JPEG, PNG, WebP.' },
        { status: 415 }
      );
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json(
        { error: 'Image trop volumineuse (5 Mo max). Compressez-la avant envoi.' },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop() || 'jpg';
    const targetUserId = (formData.get('userId') as string) || auth.userId;
    const filename = `profiles/${targetUserId}_${Date.now()}.${ext}`;

    const { url } = await uploadFile(buffer, filename, file.type);

    // Si un utilisateur existant est ciblé et que l'appelant a les droits (soi-même ou ADMIN)
    const updateTarget = (formData.get('updateUser') as string) !== 'false';
    if (updateTarget && targetUserId) {
      if (auth.role === 'ADMIN' || targetUserId === auth.userId) {
        await db.user.updateMany({
          where: { id: targetUserId, schoolId: auth.schoolId },
          data: { photoUrl: url },
        });
      }
    }

    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: 'Erreur upload' }, { status: 500 });
  }
}
