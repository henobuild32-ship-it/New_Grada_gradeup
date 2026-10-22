import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

export async function GET(request: NextRequest) {
  try {
    // Appelé depuis l'admin (et les enseignants) : jamais un élève/parent
    const auth = await requireAuth(request, ['ADMIN', 'TEACHER']);
    const schoolId = auth.schoolId;

    if (!schoolId) {
      return NextResponse.json({
        totalGenerated: 0,
        globalGenerated: 0,
        maxLimit: 1000000,
        remaining: 1000000,
        percentageUsed: 0,
        bySchool: {},
        byClass: {},
        byYear: {}
      });
    }

    const totalGenerated = await db.reportCard.count({
      where: { schoolId }
    });

    // Récupérer les compteurs pour cette école
    const counters = await db.reportCounter.findMany({
      where: { schoolId }
    });

    const globalGenerated = counters.reduce((sum, c) => sum + c.count, 0);
    const maxLimit = 1000000;
    const remaining = Math.max(0, maxLimit - globalGenerated);
    const percentageUsed = maxLimit > 0 ? (globalGenerated / maxLimit) * 100 : 0;

    // Stats par année scolaire
    const reportCards = await db.reportCard.findMany({
      where: { schoolId },
      select: { academicYear: true }
    });

    const byYear: Record<string, number> = {};
    for (const rc of reportCards) {
      byYear[rc.academicYear] = (byYear[rc.academicYear] || 0) + 1;
    }

    // Stats par classe
    const byClass: Record<string, number> = {};
    for (const c of counters) {
      byClass[c.classId] = c.count;
    }

    return NextResponse.json({
      totalGenerated,
      globalGenerated,
      maxLimit,
      remaining,
      percentageUsed,
      bySchool: { [schoolId]: totalGenerated },
      byClass,
      byYear
    });
  } catch (error) {
    return handleApiError(error);
  }
}
