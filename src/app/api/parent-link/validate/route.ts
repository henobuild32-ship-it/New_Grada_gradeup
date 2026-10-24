import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, AuthError } from '@/lib/auth/authenticate';
import { clientIp } from '@/lib/api/rate-limit';
import { persistentRateLimit } from '@/lib/api/persistent-rate-limit';
import { isInviteCodeWellFormed, isStudentCodeWellFormed, normalizeInviteCode, normalizeStudentCode } from '@/lib/code-format';

const RATE_LIMIT_MESSAGE = 'Trop de tentatives. Réessayez plus tard.';

export async function GET(request: NextRequest) {
  const ip = clientIp(request);
  let ipLimit;
  try {
    ipLimit = await persistentRateLimit(`verify-student-code:ip:${ip}`, 30, 60_000);
  } catch {
    return NextResponse.json({ valid: false, error: 'Erreur de Connexion. Veuillez vérifier votre connexion internet.' }, { status: 503 });
  }
  if (!ipLimit.ok) {
    return NextResponse.json({ valid: false, error: RATE_LIMIT_MESSAGE }, {
      status: 429,
      headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
    });
  }

  const { searchParams } = new URL(request.url);
  const parentCode = normalizeStudentCode(searchParams.get('parentCode'));
  if (!isStudentCodeWellFormed(parentCode)) return NextResponse.json({ valid: false });

  let schoolId = '';
  let authenticatedParent = false;
  try {
    const auth = authenticateRequest(request);
    if (auth.role !== 'PARENT') {
      return NextResponse.json({ valid: false, error: 'Accès non autorisé.' }, { status: 403 });
    }
    schoolId = auth.schoolId;
    authenticatedParent = true;
  } catch (error) {
    if (!(error instanceof AuthError)) {
      return NextResponse.json({ valid: false, error: 'Erreur de Connexion. Veuillez vérifier votre connexion internet.' }, { status: 503 });
    }
  }

  try {
    if (!authenticatedParent) {
      const inviteCode = normalizeInviteCode(searchParams.get('inviteCode'));
      if (!isInviteCodeWellFormed(inviteCode)) return NextResponse.json({ valid: false });
      const school = await db.school.findUnique({ where: { inviteCode }, select: { id: true } });
      if (!school) return NextResponse.json({ valid: false });
      schoolId = school.id;
    }

    const subjectLimit = await persistentRateLimit(`verify-student-code:school:${schoolId}:ip:${ip}`, 10, 60_000);
    if (!subjectLimit.ok) {
      return NextResponse.json({ valid: false, error: RATE_LIMIT_MESSAGE }, {
        status: 429,
        headers: { 'Retry-After': String(subjectLimit.retryAfterSeconds) },
      });
    }

    const student = await db.user.findFirst({
      where: { parentCode, schoolId, role: 'STUDENT', active: true, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        school: { select: { name: true } },
        classEnrollments: {
          select: { class: { select: { name: true, level: true, cycle: true, section: true, option: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!student) return NextResponse.json({ valid: false });

    const studentClass = student.classEnrollments[0]?.class;
    const className = studentClass
      ? [studentClass.name, studentClass.section, studentClass.option].filter(Boolean).join(' · ')
      : 'Classe non renseignée';
    return NextResponse.json({
      valid: true,
      studentName: student.fullName,
      className,
      schoolName: student.school.name,
    });
  } catch {
    return NextResponse.json({
      valid: false,
      error: 'Erreur de Connexion. Veuillez vérifier votre connexion internet.',
    }, { status: 503 });
  }
}
