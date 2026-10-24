import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError, ApiError } from '@/lib/api/errors';
import { generateReadableCode, isUniqueConstraintError } from '@/lib/code-generation';

// POST: Generate or regenerate invite code for the admin's own school
export async function POST(request: NextRequest) {
  try {
    // Réservé à l'admin de l'école ; le schoolId client est ignoré.
    const auth = await requireAuth(request, ['ADMIN']);
    const schoolId = auth.schoolId;

    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      throw new ApiError('École non trouvée.', 404);
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateReadableCode('ECOLE');
      try {
        const updated = await db.school.update({
          where: { id: schoolId },
          data: { inviteCode: code },
          select: { inviteCode: true },
        });
        return NextResponse.json({ inviteCode: updated.inviteCode });
      } catch (error) {
        if (isUniqueConstraintError(error)) continue;
        throw error;
      }
    }
    throw new ApiError('Impossible de générer un code unique pour le moment.', 503);
  } catch (error) {
    return handleApiError(error);
  }
}
