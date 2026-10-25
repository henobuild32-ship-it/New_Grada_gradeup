import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';

/** Read-only receipt history. Payments remain inaccessible to parents and students. */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'PARENT' && auth.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Cette route est réservée aux reçus personnels.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const requestedStudentId = searchParams.get('studentId');
    let studentIds: string[];

    if (auth.role === 'STUDENT') {
      if (requestedStudentId && requestedStudentId !== auth.userId) {
        return NextResponse.json({ error: 'Vous ne pouvez consulter que vos propres reçus.' }, { status: 403 });
      }
      studentIds = [auth.userId];
    } else {
      const children = await db.user.findMany({
        where: {
          schoolId: auth.schoolId,
          parentId: auth.userId,
          role: 'STUDENT',
          active: true,
          deletedAt: null,
          ...(requestedStudentId ? { id: requestedStudentId } : {}),
        },
        select: { id: true },
      });
      if (requestedStudentId && children.length === 0) {
        return NextResponse.json({ error: 'Cet élève n’est pas associé à votre compte parent.' }, { status: 403 });
      }
      studentIds = children.map((child) => child.id);
    }

    const payments = studentIds.length
      ? await db.payment.findMany({
          where: { schoolId: auth.schoolId, studentId: { in: studentIds }, deletedAt: null },
          include: {
            student: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        })
      : [];

    return NextResponse.json({ payments });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Impossible de charger les reçus.' }, { status: 500 });
  }
}
