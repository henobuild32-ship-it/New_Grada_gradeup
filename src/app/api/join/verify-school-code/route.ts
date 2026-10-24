import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isInviteCodeWellFormed, normalizeInviteCode } from '@/lib/code-format';
import { clientIp } from '@/lib/api/rate-limit';
import { persistentRateLimit } from '@/lib/api/persistent-rate-limit';

const RATE_LIMIT_MESSAGE = 'Trop de tentatives. Réessayez plus tard.';

export async function GET(request: NextRequest) {
  try {
    const ip = clientIp(request);
    const ipLimit = await persistentRateLimit(`verify-school-code:ip:${ip}`, 30, 60_000);
    if (!ipLimit.ok) {
      return NextResponse.json({ valid: false, error: RATE_LIMIT_MESSAGE }, {
        status: 429,
        headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
      });
    }

    const requestedCode = new URL(request.url).searchParams.get('code');
    const inviteCode = normalizeInviteCode(requestedCode);
    if (!isInviteCodeWellFormed(inviteCode)) return NextResponse.json({ valid: false });

    const school = await db.school.findUnique({
      where: { inviteCode },
      select: { id: true, name: true },
    });
    const subject = school?.id ?? inviteCode;
    const subjectLimit = await persistentRateLimit(`verify-school-code:school:${subject}:ip:${ip}`, 10, 60_000);
    if (!subjectLimit.ok) {
      return NextResponse.json({ valid: false, error: RATE_LIMIT_MESSAGE }, {
        status: 429,
        headers: { 'Retry-After': String(subjectLimit.retryAfterSeconds) },
      });
    }

    if (!school) return NextResponse.json({ valid: false });

    const classes = await db.schoolClass.findMany({
      where: { schoolId: school.id, deletedAt: null },
      select: { id: true, name: true, level: true, cycle: true, section: true, option: true },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json({ valid: true, school, classes });
  } catch {
    return NextResponse.json({ error: 'Erreur de Connexion. Veuillez vérifier votre connexion internet.' }, { status: 503 });
  }
}
