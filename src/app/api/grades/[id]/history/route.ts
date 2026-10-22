import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth/authenticate';
import { assertSchool, assertStudentScope } from '@/lib/api/rbac';
import { ApiError, handleApiError } from '@/lib/api/errors';

// GET /api/grades/[id]/history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    const { id } = await params;

    const grade = await db.grade.findUnique({ where: { id } });
    if (!grade) {
      return NextResponse.json({ error: 'Note introuvable' }, { status: 404 });
    }

    assertSchool(auth, grade.schoolId);

    if (auth.role === 'ADMIN') {
      // autorisé
    } else if (auth.role === 'TEACHER') {
      // Seul le professeur propriétaire de la note
      if (grade.teacherId !== auth.userId) {
        throw new ApiError('Accès refusé : cette note ne vous appartient pas.', 403, 'OWNERSHIP_FORBIDDEN');
      }
    } else {
      // STUDENT / PARENT : uniquement leurs propres données
      await assertStudentScope(auth, grade.studentId);
    }

    const history = await db.gradeHistory.findMany({
      where: { gradeId: id },
      include: {
        modifier: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ history });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
