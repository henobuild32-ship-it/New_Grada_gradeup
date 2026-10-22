import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api/rbac';
import { handleApiError } from '@/lib/api/errors';

// Progression annuelle GLOBALE calculée à 100% sur des données réelles.
// Aucune valeur fictive : chaque composant est un ratio réel entre données
// enregistrées et un volume de référence (année scolaire complète).
export async function GET(request: NextRequest) {
  try {
    // Indicateurs agrégés au niveau école : réservés à l'admin et aux enseignants,
    // et limités à l'école de la session (le schoolId client est ignoré).
    const auth = await requireAuth(request, ['ADMIN', 'TEACHER']);
    const schoolId = auth.schoolId;

    // Volumes de référence d'une année scolaire complète
    const SCHOOL_DAYS = 180;            // ~180 jours de présence attendus par élève
    const LESSONS_PER_COURSE = 12;      // leçons attendues par cours sur l'année
    const GRADES_PER_STUDENT_COURSE = 3; // évaluations attendues par élève/cours

    const [
      courses,
      lessons,
      grades,
      students,
      attendance,
      presences,
      reportCards,
    ] = await Promise.all([
      db.course.findMany({ where: { schoolId }, select: { id: true } }),
      db.lesson.findMany({ where: { schoolId }, select: { id: true, content: true } }),
      db.grade.findMany({ where: { schoolId }, select: { id: true } }),
      db.user.findMany({ where: { schoolId, role: 'STUDENT', active: true }, select: { id: true } }),
      db.attendance.findMany({ where: { schoolId }, select: { status: true } }),
      db.presence.findMany({ where: { schoolId }, select: { statut: true } }),
      db.reportCard.findMany({ where: { schoolId }, select: { status: true } }),
    ]);

    const totalCourses = courses.length;
    const totalStudents = students.length;
    const lessonsPublished = lessons.filter((l) => l.content && l.content.trim().length > 0).length;
    const validatedBulletins = reportCards.filter((rc) => rc.status === 'validated').length;
    const presencesCount = presences.filter((p) => p.statut === 'PRESENT' || p.statut === 'JUSTIFIE').length;

    // Composants (chacun 0..1)
    const coverageCours = totalCourses > 0 ? Math.min(1, lessonsPublished / (totalCourses * LESSONS_PER_COURSE)) : 0;
    const coverageNotes =
      totalCourses > 0 && totalStudents > 0
        ? Math.min(1, grades.length / (totalStudents * totalCourses * GRADES_PER_STUDENT_COURSE))
        : 0;
    const coveragePresence =
      totalStudents > 0 ? Math.min(1, presencesCount / (totalStudents * SCHOOL_DAYS)) : 0;
    const bulletins =
      totalStudents > 0 ? Math.min(1, validatedBulletins / (totalStudents * 3)) : 0;

    const components = {
      coverageCours: Math.round(coverageCours * 1000) / 10,
      coverageNotes: Math.round(coverageNotes * 1000) / 10,
      coveragePresence: Math.round(coveragePresence * 1000) / 10,
      bulletins: Math.round(bulletins * 1000) / 10,
    };

    const progression = Math.round(
      ((coverageCours + coverageNotes + coveragePresence + bulletins) / 4) * 1000
    ) / 10;

    return NextResponse.json({
      progression,
      components,
      raw: {
        totalCourses,
        totalStudents,
        lessonsPublished,
        totalGrades: grades.length,
        presencesCount,
        validatedBulletins,
        totalAttendance: attendance.length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
