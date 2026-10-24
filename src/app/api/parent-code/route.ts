import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, AuthError } from '@/lib/auth/authenticate';

function generateParentCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'P-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(randomInt(chars.length));
  }
  return code;
}

// POST: Generate or regenerate parent code for a student
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Seul un administrateur peut générer un code parent' }, { status: 403 });
    }

    const body = await request.json();
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
    if (!userId) {
      return NextResponse.json({ error: 'userId requis.' }, { status: 400 });
    }

    const user = await db.user.findFirst({
      where: { id: userId, schoolId: auth.schoolId, role: 'STUDENT', deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'Élève non trouvé.' }, { status: 404 });
    }

    let updated: { parentCode: string | null } | null = null;
    for (let attempt = 0; attempt < 5 && !updated; attempt++) {
      const code = generateParentCode();
      try {
        updated = await db.user.update({
          where: { id: user.id },
          data: { parentCode: code },
          select: { parentCode: true },
        });
      } catch (error) {
        if (
          typeof error === 'object' && error !== null && 'code' in error &&
          (error as { code?: unknown }).code === 'P2002'
        ) continue;
        throw error;
      }
    }
    if (!updated?.parentCode) {
      return NextResponse.json({ error: 'Impossible de générer un code parent pour le moment.' }, { status: 503 });
    }

    return NextResponse.json({ parentCode: updated.parentCode });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur interne.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
