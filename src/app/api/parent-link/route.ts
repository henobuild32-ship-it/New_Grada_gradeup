import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, AuthError } from '@/lib/auth/authenticate';
import { clientIp } from '@/lib/api/rate-limit';
import { persistentRateLimit } from '@/lib/api/persistent-rate-limit';
import { isStudentCodeWellFormed, normalizeStudentCode } from '@/lib/code-format';

const INVALID_CODE_MESSAGE = 'Le code n’est pas valide.';

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if (auth.role !== 'PARENT') {
      return NextResponse.json({ error: 'Seul un parent peut lier un enfant.' }, { status: 403 });
    }

    const ip = clientIp(request);
    const ipLimit = await persistentRateLimit(`link-student-code:ip:${ip}`, 20, 60_000);
    const schoolLimit = await persistentRateLimit(`link-student-code:school:${auth.schoolId}:ip:${ip}`, 10, 60_000);
    if (!ipLimit.ok || !schoolLimit.ok) {
      const retryAfter = Math.max(ipLimit.retryAfterSeconds, schoolLimit.retryAfterSeconds);
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      });
    }

    const body = await request.json();
    const parentCode = normalizeStudentCode(typeof body?.parentCode === 'string' ? body.parentCode : '');
    if (!isStudentCodeWellFormed(parentCode)) {
      return NextResponse.json({ error: INVALID_CODE_MESSAGE }, { status: 400 });
    }

    const parent = await db.user.findFirst({
      where: { id: auth.userId, schoolId: auth.schoolId, role: 'PARENT', active: true, deletedAt: null },
      select: { id: true },
    });
    if (!parent) return NextResponse.json({ error: 'Compte parent invalide.' }, { status: 403 });

    const student = await db.user.findFirst({
      where: { parentCode, schoolId: auth.schoolId, role: 'STUDENT', active: true, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        photoUrl: true,
        parentId: true,
        classEnrollments: { include: { class: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!student) return NextResponse.json({ error: INVALID_CODE_MESSAGE }, { status: 404 });

    if (student.parentId === parent.id) {
      return NextResponse.json({ success: true, alreadyLinked: true, student });
    }
    if (student.parentId) {
      return NextResponse.json({ error: 'Cet enfant est déjà rattaché à un compte parent.' }, { status: 409 });
    }

    // Conditional update prevents two parents from claiming the same child at once.
    const linked = await db.user.updateMany({
      where: { id: student.id, schoolId: auth.schoolId, role: 'STUDENT', parentCode, parentId: null, active: true, deletedAt: null },
      data: { parentId: parent.id },
    });
    if (linked.count !== 1) {
      const latest = await db.user.findUnique({ where: { id: student.id }, select: { parentId: true } });
      if (latest?.parentId === parent.id) {
        return NextResponse.json({ success: true, alreadyLinked: true, student });
      }
      return NextResponse.json({ error: 'Cet enfant est déjà rattaché à un compte parent.' }, { status: 409 });
    }

    return NextResponse.json({ success: true, student: { ...student, parentId: parent.id } });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Erreur de Connexion. Veuillez vérifier votre connexion internet.' }, { status: 503 });
  }
}
