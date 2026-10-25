import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN' && auth.role !== 'LECTEUR') return NextResponse.json({ error: 'Accès réservé à l’administration et au Lecteur.' }, { status: 403 });
    const schoolId = auth.schoolId;

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });
    }

    const [
      totalStudents,
      totalTeachers,
      totalParents,
      totalClasses,
      totalCourses,
      school,
    ] = await Promise.all([
      db.user.count({ where: { schoolId, role: 'STUDENT', active: true, deletedAt: null } }),
      db.user.count({ where: { schoolId, role: 'TEACHER', active: true, deletedAt: null } }),
      db.user.count({ where: { schoolId, role: 'PARENT', active: true, deletedAt: null } }),
      db.schoolClass.count({ where: { schoolId, deletedAt: null } }),
      db.course.count({ where: { schoolId, deletedAt: null } }),
      db.school.findUnique({ where: { id: schoolId }, select: { currency: true } }),
    ]);
    const configuredCurrency = school?.currency || 'USD';

    const attendanceToday = new Date().toISOString().split('T')[0];
    const [
      presentToday,
      absentToday,
      totalAttendanceToday,
    ] = await Promise.all([
      db.attendance.count({
        where: { schoolId, date: attendanceToday, status: 'present', deletedAt: null },
      }),
      db.attendance.count({
        where: { schoolId, date: attendanceToday, status: 'absent', deletedAt: null },
      }),
      db.attendance.count({
        where: { schoolId, date: attendanceToday, deletedAt: null },
      }),
    ]);

    return NextResponse.json({
      stats: {
        totalStudents,
        totalTeachers,
        totalParents,
        totalClasses,
        totalCourses,
        currency: configuredCurrency,
        attendanceToday: {
          present: presentToday,
          absent: absentToday,
          total: totalAttendanceToday,
        },
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
