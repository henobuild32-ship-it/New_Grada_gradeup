import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError, ApiError } from '@/lib/api/errors';

/**
 * Garde DOUBLE obligatoire (y compris en production) :
 *   1. session ADMIN valide ;
 *   2. header `x-admin-secret` égal à ADMIN_OPS_KEY (ou JWT_SECRET à défaut).
 * L'ancienne voie `?secret=<JWT_SECRET>` en query string est supprimée :
 * un secret en URL finit dans les logs (proxy, navigateur, Referer).
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

async function assertOpsAccess(request: NextRequest): Promise<void> {
  await requireAuth(request, ['ADMIN']);

  const expected = process.env.ADMIN_OPS_KEY || process.env.JWT_SECRET;
  const provided = request.headers.get('x-admin-secret');
  if (!expected || !provided || !secretMatches(provided, expected)) {
    throw new ApiError('Non autorisé.', 401, 'UNAUTHENTICATED');
  }
}

// GET /api/admin/db-health - diagnostic (ADMIN + secret d'ops en header)
export async function GET(request: NextRequest) {
  try {
    await assertOpsAccess(request);

    // Compter les écoles et leurs statuts
    const schools = await db.school.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        inviteCode: true,
        subscriptionStatus: true,
        subscriptionExpiry: true,
        _count: { select: { users: true } },
      },
    });

    const now = new Date();
    const expiredByDate = schools.filter(
      s => s.subscriptionExpiry && new Date(s.subscriptionExpiry) < now && s.subscriptionStatus === 'active'
    );

    return NextResponse.json({
      totalSchools: schools.length,
      schools: schools.map(s => ({
        ...s,
        isExpiredByDate: s.subscriptionExpiry ? new Date(s.subscriptionExpiry) < now : false,
      })),
      expiredByDateCount: expiredByDate.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/admin/db-health - Remet tous les abonnements à active
export async function POST(request: NextRequest) {
  try {
    await assertOpsAccess(request);

    const twoYearsFromNow = new Date();
    twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);

    // Réactiver tous les abonnements non-suspendus
    const result = await db.school.updateMany({
      where: {
        subscriptionStatus: { not: 'suspended' },
      },
      data: {
        subscriptionStatus: 'active',
        subscriptionExpiry: twoYearsFromNow,
      },
    });

    // Réactiver tous les comptes désactivés par accident
    const usersResult = await db.user.updateMany({
      where: { active: false },
      data: { active: true },
    });

    console.warn('[db-health] Réactivation massive effectuée (ADMIN + x-admin-secret).', {
      schoolsFixed: result.count,
      usersReactivated: usersResult.count,
      at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      schoolsFixed: result.count,
      usersReactivated: usersResult.count,
      newExpiry: twoYearsFromNow.toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
