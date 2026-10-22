import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { hashPassword } from '@/lib/password';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Action réservée aux administrateurs.' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, newPassword } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId requis.' }, { status: 400 });
    }

    const targetUser = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, schoolId: true, fullName: true, email: true },
    });

    if (!targetUser || targetUser.schoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 });
    }

    // Si aucun mot de passe n'est fourni, en générer un temporaire
    const generatedPassword = newPassword || `Pass${Math.floor(1000 + Math.random() * 9000)}!`;

    await db.user.update({
      where: { id: userId },
      data: { password: await hashPassword(generatedPassword) },
    });

    return NextResponse.json({
      success: true,
      message: `Mot de passe réinitialisé pour ${targetUser.fullName}.`,
      temporaryPassword: generatedPassword,
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
