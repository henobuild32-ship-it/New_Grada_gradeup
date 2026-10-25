import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { confidentialRole, lockConfidentialCode } from '@/lib/confidential-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!secret || !provided) return false;
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  try {
    const now = new Date();
    let codesRotated = 0;
    let schoolsProcessed = 0;
    const dueCodes = await db.confidentialAccessCode.findMany({
      where: { rotateAt: { lte: now }, suspendedAt: null },
      select: { schoolId: true, role: true },
      take: 500,
      orderBy: { rotateAt: 'asc' },
    });
    for (const due of dueCodes) {
      const role = due.role;
      if (!confidentialRole(role)) continue;
      const changed = await db.$transaction(async (tx) => {
        const previous = await tx.confidentialAccessCode.findUnique({ where: { schoolId_role: { schoolId: due.schoolId, role } } });
        const current = await lockConfidentialCode(tx, due.schoolId, role, now);
        return Boolean(previous && current.issuedAt.getTime() > previous.issuedAt.getTime());
      });
      schoolsProcessed++;
      if (changed) codesRotated++;
    }
    return NextResponse.json({ ok: true, schoolsProcessed, codesRotated, executedAt: now.toISOString() }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Rotation des codes impossible.' }, { status: 500 });
  }
}
