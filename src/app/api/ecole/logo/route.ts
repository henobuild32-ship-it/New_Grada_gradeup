import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/storage';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

const MAX_SIZE_BYTES = 48 * 1024 * 1024; // 48 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

// POST /api/ecole/logo — Upload a new school logo to Supabase Storage
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['ADMIN']);
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const schoolId = auth.schoolId;

    if (!file || !schoolId) {
      return NextResponse.json({ error: 'Fichier et schoolId sont requis.' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Format invalide. Acceptés : JPG, PNG, WEBP, GIF, SVG.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Fichier trop volumineux (max ${MAX_SIZE_BYTES / 1024 / 1024} MB).` },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine file extension
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const storagePath = `logos/${schoolId}.${ext}`;

    const { url, provider } = await uploadFile(buffer, storagePath, file.type);

    // Persist the URL in the School model
    const updated = await db.school.update({
      where: { id: schoolId },
      data: { logoUrl: url },
      select: { id: true, logoUrl: true },
    });

    return NextResponse.json(
      { logoUrl: updated.logoUrl, provider },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('[api/ecole/logo POST]', error);
    return handleApiError(error);
  }
}

// DELETE /api/ecole/logo — Remove the school logo (set logoUrl to "")
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['ADMIN']);
    const schoolId = auth.schoolId;

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis.' }, { status: 400 });
    }

    await db.school.update({
      where: { id: schoolId },
      data: { logoUrl: '' },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error('[api/ecole/logo DELETE]', error);
    return handleApiError(error);
  }
}
