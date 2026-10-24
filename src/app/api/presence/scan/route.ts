import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, AuthError } from '@/lib/auth/authenticate';
import { auditFromRequest } from '@/lib/api/audit';

function extractCardCode(value: string) {
  const text = value.trim();
  try {
    const url = new URL(text);
    const marker = url.pathname.split('/').filter(Boolean);
    if (marker.length >= 2 && marker[marker.length - 2] === 'carte') return decodeURIComponent(marker[marker.length - 1]);
  } catch { /* QR peut contenir directement le matricule */ }
  return text;
}

/** POST /api/presence/scan — pointage par QR depuis le panneau admin. */
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if (auth.role !== 'ADMIN') return NextResponse.json({ error: 'Pointage QR réservé à l’administration.' }, { status: 403 });
    const body = await request.json();
    const rawCode = typeof body?.code === 'string' ? body.code : '';
    const code = extractCardCode(rawCode);
    if (!code || code.length > 200) return NextResponse.json({ error: 'Code QR invalide.' }, { status: 400 });

    const scannedUser = await db.user.findFirst({
      where: {
        schoolId: auth.schoolId,
        active: true,
        deletedAt: null,
        role: { in: ['STUDENT', 'TEACHER'] },
        OR: [{ id: code }, { matricule: code }, { cardId: code }],
      },
      select: { id: true, fullName: true, role: true, parentId: true },
    });
    if (!scannedUser) return NextResponse.json({ error: 'Carte inconnue, inactive ou rattachée à un autre établissement.' }, { status: 404 });

    const now = new Date();
    const dateKey = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const existing = await db.presence.findFirst({
      where: { schoolId: auth.schoolId, userId: scannedUser.id, date: dateKey, deletedAt: null },
      select: { id: true, statut: true, heureArrivee: true },
    });
    if (existing) return NextResponse.json({ duplicate: true, user: scannedUser, presence: existing }, { status: 409 });

    const presence = await db.presence.create({
      data: { schoolId: auth.schoolId, userId: scannedUser.id, date: dateKey, heureArrivee: now, statut: 'PRESENT' },
    }).catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002') return null;
      throw error;
    });
    if (!presence) {
      return NextResponse.json({ duplicate: true, user: scannedUser, error: 'Pointage déjà enregistré.' }, { status: 409 });
    }

    await auditFromRequest(request, {
      schoolId: auth.schoolId,
      userId: auth.userId,
      action: 'PRESENCE_QR_SCAN',
      entity: 'Presence',
      entityId: presence.id,
      after: { userId: scannedUser.id, role: scannedUser.role, status: 'PRESENT' },
    });

    return NextResponse.json({ success: true, user: scannedUser, presence }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Pointage QR impossible.' }, { status: 500 });
  }
}
