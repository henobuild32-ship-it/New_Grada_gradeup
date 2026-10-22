import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

// Champs exposés sans session : jamais de email/password/abonnement/inviteCode.
function publicView(school: {
  id: string;
  name: string;
  logoUrl: string;
  city: string;
  province: string;
  commune: string;
  schoolCode: string;
  color: string;
  currency: string;
  academicYear: string;
  heureArriveeScolaire: string;
}) {
  return {
    id: school.id,
    name: school.name,
    logoUrl: school.logoUrl,
    city: school.city,
    province: school.province,
    commune: school.commune,
    schoolCode: school.schoolCode,
    color: school.color,
    currency: school.currency,
    academicYear: school.academicYear,
    heureArriveeScolaire: school.heureArriveeScolaire,
  };
}

// Changers autorisés par un admin de l'école (pas d'abonnement/inviteCode/password).
const UPDATABLE_FIELDS = [
  'name',
  'email',
  'logoUrl',
  'province',
  'city',
  'commune',
  'schoolCode',
  'color',
  'academicYear',
  'heureArriveeScolaire',
  'currency',
  'latitude',
  'longitude',
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'School ID is required' }, { status: 400 });
    }

    const school = await db.school.findUnique({
      where: { id }
    });

    if (!school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    // Session optionnelle : sans session (ou école différente) => champs publics uniquement.
    let sameSchool = false;
    try {
      const auth = await requireAuth(request);
      sameSchool = auth.schoolId === id;
    } catch {
      sameSchool = false;
    }

    if (!sameSchool) {
      return NextResponse.json(publicView(school));
    }

    // Retourner les infos sans le mot de passe
    const { password, ...schoolInfo } = school;
    return NextResponse.json(schoolInfo);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(request, ['ADMIN']);
    assertSchool(auth, id);

    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    for (const field of UPDATABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updateData[field] = body[field];
      }
    }

    const school = await db.school.update({
      where: { id },
      data: updateData
    });

    const { password: _, ...schoolInfo } = school;
    return NextResponse.json(schoolInfo);
  } catch (error) {
    return handleApiError(error);
  }
}
