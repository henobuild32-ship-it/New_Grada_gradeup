import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';

export const runtime = 'nodejs';

// GET /api/note-modifications?studentId=&status=&courseId=
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequestActive(req);
    const { searchParams } = new URL(req.url);
    const requestedSchoolId = searchParams.get('schoolId');
    const schoolId = auth.schoolId;
    if (requestedSchoolId && requestedSchoolId !== auth.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé à cet établissement.' }, { status: 403 });
    }
    const studentId = searchParams.get('studentId') || '';
    const status = searchParams.get('status') || '';
    const courseId = searchParams.get('courseId') || '';

    const where: Record<string, unknown> = { schoolId };
    if (studentId) where.studentId = studentId;
    if (status) where.requestStatus = status;
    if (courseId) where.courseId = courseId;

    // Le périmètre est dérivé de la session, jamais du filtre fourni par le client.
    if (auth.role === 'LECTEUR' || auth.role === 'ADMIN') {
      // Lecture de toutes les demandes de l’établissement.
    } else if (auth.role === 'PARENT') {
      const children = await db.user.findMany({ where: { schoolId, parentId: auth.userId, role: 'STUDENT', active: true, deletedAt: null }, select: { id: true } });
      const childIds = children.map((child) => child.id);
      if (studentId && !childIds.includes(studentId)) return NextResponse.json({ error: 'Demande hors du périmètre de vos enfants.' }, { status: 403 });
      where.studentId = studentId || { in: childIds };
    } else if (auth.role === 'STUDENT') {
      where.studentId = auth.userId;
    } else if (auth.role !== 'TEACHER') {
      return NextResponse.json({ error: 'Accès non autorisé.' }, { status: 403 });
    }
    if (auth.role === 'TEACHER') {
      const teacherCourses = await db.course.findMany({
        where: { schoolId, teacherId: auth.userId, deletedAt: null },
        select: { id: true },
      });
      const courseIds = teacherCourses.map((c) => c.id);
      if (courseIds.length > 0) where.courseId = { in: courseIds };
      else where.courseId = 'none';
    }

    const mods = await db.noteModification.findMany({
      where,
      include: {
        student: { select: { id: true, fullName: true, matricule: true, photoUrl: true } },
        course: { select: { id: true, name: true } },
        modifier: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ noteModifications: mods });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[GET /api/note-modifications]', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/note-modifications { noteId, oldValue, newValue, oldMax, newMax, reason }
// Étudiant / parent / enseignant demande une correction de note.
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!['STUDENT', 'PARENT', 'TEACHER'].includes(auth.role)) {
      return NextResponse.json({ error: 'Cette action est réservée aux élèves, parents et professeurs.' }, { status: 403 });
    }
    const body = await req.json();
    const { noteId, oldValue, newValue, oldMax, newMax, reason } = body;

    if (!noteId || typeof newValue !== 'number' || !reason?.trim()) {
      return NextResponse.json({ error: 'noteId, newValue (nombre) et reason (texte) sont requis.' }, { status: 400 });
    }

    const grade = await db.grade.findUnique({ where: { id: noteId } });
    if (!grade || grade.schoolId !== auth.schoolId || grade.deletedAt) {
      return NextResponse.json({ error: 'Note introuvable dans cette école.' }, { status: 404 });
    }

    // Permission : étudiant ne modifie que ses propres notes
    if (auth.role === 'STUDENT' && grade.studentId !== auth.userId) {
      return NextResponse.json({ error: 'Vous ne pouvez pas demander de modification pour cette note.' }, { status: 403 });
    }
    if (auth.role === 'PARENT') {
      const child = await db.user.findFirst({ where: { id: grade.studentId, schoolId: auth.schoolId, parentId: auth.userId, role: 'STUDENT', active: true, deletedAt: null }, select: { id: true } });
      if (!child) return NextResponse.json({ error: 'Vous ne pouvez demander une modification que pour la note de votre enfant.' }, { status: 403 });
    }
    if (auth.role === 'TEACHER') {
      const course = await db.course.findUnique({
        where: { id: grade.courseId },
        select: { teacherId: true },
      });
      if (course?.teacherId !== auth.userId) {
        return NextResponse.json({ error: 'Vous ne pouvez demander une modification que pour vos propres cours.' }, { status: 403 });
      }
    }

    const finalOld = oldValue as number ?? grade.score;
    const finalNew = newValue;
    const finalOldMax = oldMax as number ?? grade.maxScore;
    const finalNewMax = newMax as number ?? grade.maxScore;

    // Évite les doublons de demandes en attente
    const existing = await db.noteModification.findFirst({
      where: { noteId, requestStatus: 'PENDING' },
    });
    if (existing) {
      return NextResponse.json({ error: 'Une demande est déjà en attente pour cette note.' }, { status: 409 });
    }

    const mod = await db.noteModification.create({
      data: {
        noteId,
        schoolId: auth.schoolId,
        studentId: grade.studentId,
        courseId: grade.courseId,
        modifierId: auth.userId,
        oldValue: finalOld,
        newValue: finalNew,
        oldMax: finalOldMax,
        newMax: finalNewMax,
        reason: reason.trim(),
        requestStatus: 'PENDING',
        ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '',
      },
      include: {
        student: { select: { id: true, fullName: true } },
        course: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ noteModification: mod }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[POST /api/note-modifications]', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
