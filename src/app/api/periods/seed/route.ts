import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';

export const runtime = 'nodejs';

const DEFAULT_RDC_PERIODS = [
  { code: 'P1', name: '1ère Période (P1)', trimester: 1, semester: 1, startDate: '09-01', endDate: '10-31' },
  { code: 'P2', name: '2ème Période (P2)', trimester: 1, semester: 1, startDate: '11-01', endDate: '12-23' },
  { code: 'EX1', name: 'Examens du 1er Semestre', trimester: 1, semester: 1, startDate: '01-10', endDate: '02-05' },
  { code: 'P3', name: '3ème Période (P3)', trimester: 2, semester: 2, startDate: '02-15', endDate: '04-10' },
  { code: 'P4', name: '4ème Période (P4)', trimester: 2, semester: 2, startDate: '04-20', endDate: '06-15' },
  { code: 'EX2', name: 'Examens du 2ème Semestre', trimester: 2, semester: 2, startDate: '06-20', endDate: '07-02' },
];

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequestActive(req);
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Action réservée aux administrateurs.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const schoolYearId = body.schoolYearId || '';

    let createdCount = 0;
    for (const p of DEFAULT_RDC_PERIODS) {
      const existing = await db.period.findFirst({
        where: { schoolId: auth.schoolId, code: p.code, deletedAt: null },
      });

      if (!existing) {
        await db.period.create({
          data: {
            schoolId: auth.schoolId,
            code: p.code,
            name: p.name,
            trimester: p.trimester,
            semester: p.semester,
            startDate: p.startDate,
            endDate: p.endDate,
            schoolYearId,
            status: 'OPEN',
            isLocked: false,
          },
        });
        createdCount++;
      }
    }

    const allPeriods = await db.period.findMany({
      where: { schoolId: auth.schoolId, deletedAt: null },
      orderBy: { code: 'asc' },
    });

    return NextResponse.json({
      message: `${createdCount} périodes RDC générées`,
      createdCount,
      periods: allPeriods,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[POST /api/periods/seed]', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
