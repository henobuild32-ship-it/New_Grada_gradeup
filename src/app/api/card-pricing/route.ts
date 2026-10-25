import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { auditFromRequest } from '@/lib/api/audit';

const schema = z.object({ priceCdf: z.number().int().min(0).max(10_000_000) }).strict();

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (!['ADMIN', 'CAISSIER', 'LECTEUR'].includes(auth.role)) return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 });
    const school = await db.school.findFirst({ where: { id: auth.schoolId, deletedAt: null }, select: { studentCardPriceCdf: true, currency: true } });
    if (!school) return NextResponse.json({ error: 'École introuvable.' }, { status: 404 });
    return NextResponse.json({ priceCdf: school.studentCardPriceCdf, currency: 'CDF' });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Impossible de charger le prix des cartes.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'CAISSIER') return NextResponse.json({ error: 'Seul le caissier peut configurer le prix des cartes.' }, { status: 403 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Prix invalide. Entrez un montant en CDF entre 0 et 10 000 000.' }, { status: 400 });
    const before = await db.school.findFirst({ where: { id: auth.schoolId, deletedAt: null }, select: { studentCardPriceCdf: true } });
    if (!before) return NextResponse.json({ error: 'École introuvable.' }, { status: 404 });
    const updated = await db.school.update({ where: { id: auth.schoolId }, data: { studentCardPriceCdf: parsed.data.priceCdf }, select: { studentCardPriceCdf: true } });
    await auditFromRequest(request, { schoolId: auth.schoolId, userId: auth.userId, action: 'STUDENT_CARD_PRICE_UPDATE', entity: 'School', entityId: auth.schoolId, before, after: updated });
    return NextResponse.json({ priceCdf: updated.studentCardPriceCdf, currency: 'CDF' });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Impossible d’enregistrer le prix des cartes.' }, { status: 500 });
  }
}
