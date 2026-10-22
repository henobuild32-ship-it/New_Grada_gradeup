import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError, ApiError } from '@/lib/api/errors';

// POST /api/admin/fix-subscription - Remet les abonnements à "active" pour l'école de l'admin connecté
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, ['ADMIN']);

    let body: { schoolId?: string } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    // schoolId client accepté uniquement s'il désigne l'école de la session.
    if (body.schoolId) {
      assertSchool(auth, body.schoolId);
    }

    const school = await db.school.findUnique({ where: { id: auth.schoolId } });
    if (!school) {
      throw new ApiError('École introuvable.', 404);
    }

    // Mettre à jour l'abonnement à active avec une expiration dans 2 ans
    const twoYearsFromNow = new Date();
    twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);

    const updated = await db.school.update({
      where: { id: school.id },
      data: {
        subscriptionStatus: 'active',
        subscriptionExpiry: twoYearsFromNow,
      },
    });

    return NextResponse.json({
      success: true,
      school: { id: updated.id, name: updated.name, subscriptionStatus: updated.subscriptionStatus, subscriptionExpiry: updated.subscriptionExpiry },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET - Vérifie le statut de l'abonnement de toutes les écoles (admin connecté requis)
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['ADMIN']);
    const schools = await db.school.findMany({
      select: { id: true, name: true, subscriptionStatus: true, subscriptionExpiry: true, inviteCode: true },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ schools });
  } catch (error) {
    return handleApiError(error);
  }
}
