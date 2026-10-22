import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, assertSchool } from '@/lib/api/rbac';
import { handleApiError, ApiError } from '@/lib/api/errors';

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireAuth(request);
    const { userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const user = await db.user.findFirst({
      where: {
        OR: [
          { id: userId },
          { matricule: userId },
          { cardId: userId },
        ],
      },
      include: {
        school: true,
        classEnrollments: { include: { class: true } },
        parent: { select: { id: true, fullName: true, phone: true, email: true, parentCode: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    if (user.id !== auth.userId) {
      if (auth.role !== 'ADMIN') {
        throw new ApiError('Accès refusé : carte réservée au propriétaire ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
      }
      assertSchool(auth, user.schoolId);
    }

    const enrollment = user.classEnrollments?.[0];
    const className = enrollment?.class?.name || '';
    const niveau = enrollment?.class?.level || '';

    const cardData = {
      id: user.id,
      fullName: user.fullName,
      postName: user.postName,
      email: user.email,
      phone: user.phone,
      gender: user.gender === 'M' ? 'Masculin' : 'Féminin',
      birthDate: user.birthDate,
      photoUrl: user.photoUrl || null,
      role: user.role,
      roleLabel: user.role === 'TEACHER' ? 'Enseignant' : 'Élève',
      matricule: user.matricule || user.cardId || '',
      ine: user.ine || user.cardId || user.id.slice(-8),
      className,
      niveau,
      section: user.section,
      courseName: user.section,
      bloodType: user.bloodType || null,
      nationality: user.nationality || null,
      address: user.address || null,
      parentEmail: user.parentEmail || null,
      tuteur: user.tuteur || user.parent?.fullName || null,
      contactTuteur: user.contactTuteur || user.parent?.phone || null,
      allergies: user.allergies || null,
      assurance: user.assurance || null,
      academicYear: user.academicYear || '',
      cardId: user.cardId || null,
      cardIssuedDate: user.cardIssuedDate || null,
      cardExpiryDate: user.cardExpiryDate || null,
      school: {
        id: user.school.id,
        name: user.school.name,
        logoUrl: user.school.logoUrl || null,
        color: user.school.color || '#2563eb',
        email: user.school.email,
        province: user.school.province,
        city: user.school.city,
        commune: user.school.commune,
        schoolCode: user.school.schoolCode,
        academicYear: user.school.academicYear || user.academicYear || '',
      },
    };

    return NextResponse.json({ card: cardData });
  } catch (error) {
    return handleApiError(error);
  }
}
