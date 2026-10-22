import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError, ApiError } from '@/lib/api/errors';

function generateCode(prefix: string, length: number = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = prefix + '-';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

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

    let code = generateCode('ECOLE', 6);
    while (await db.school.findUnique({ where: { inviteCode: code } })) {
      code = generateCode('ECOLE', 6);
    }

    const updated = await db.school.update({
      where: { id: schoolId },
      data: { inviteCode: code },
    });

    return NextResponse.json({ inviteCode: updated.inviteCode });
  } catch (error) {
    return handleApiError(error);
  }
}
