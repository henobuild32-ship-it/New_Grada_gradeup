import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AuthError, authenticateRequest } from '@/lib/auth/authenticate';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (auth.role !== 'ADMIN' && auth.role !== 'LECTEUR') {
      return NextResponse.json({ error: 'Accès réservé à la direction et aux lecteurs.' }, { status: 403 });
    }
    const pageSize = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get('limit') || 50)));
    const logs = await db.auditLog.findMany({
      where: { schoolId: auth.schoolId },
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      select: {
        id: true,
        action: true,
        entity: true,
        createdAt: true,
        user: { select: { id: true, fullName: true, role: true } },
      },
    });
    return NextResponse.json({ logs }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Impossible de charger le journal.' }, { status: 500 });
  }
}
