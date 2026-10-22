import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, AuthError } from '@/lib/auth/authenticate';

/**
 * GET /api/sync/pull?since=<ISO|epoch> — delta par entité, par rôle et
 * par établissement. Retourne les enregistrements modifiés depuis `since`
 * et un nouveau curseur (timestamp serveur).
 *
 * Filtrage par rôle : un élève ne tire que ses données, un parent celles
 * de ses enfants, un prof ses classes/cours, un admin tout l'établissement.
 */

const MAX_ROWS = 500;

function parseSince(raw: string | null): Date | null {
  if (!raw) return null;
  const asNumber = Number(raw);
  if (!Number.isNaN(asNumber) && asNumber > 0) return new Date(asNumber);
  const asDate = new Date(raw);
  return Number.isNaN(asDate.getTime()) ? null : asDate;
}

async function childrenIds(parentId: string): Promise<string[]> {
  const children = await db.user.findMany({ where: { parentId }, select: { id: true } });
  return children.map((c) => c.id);
}

async function studentClassIds(studentId: string): Promise<string[]> {
  const enrollments = await db.enrolledClass.findMany({ where: { userId: studentId }, select: { classId: true } });
  return enrollments.map((e) => e.classId);
}

async function titulaireClassIds(teacherId: string): Promise<string[]> {
  const t = await db.user.findUnique({ where: { id: teacherId }, select: { titulaireClasses: { select: { id: true } } } });
  return (t?.titulaireClasses ?? []).map((c) => c.id);
}

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    const { searchParams } = new URL(request.url);
    const since = parseSince(searchParams.get('since'));
    const cursor = new Date();
    const schoolId = auth.schoolId;
    const role = auth.role;
    const userId = auth.userId;
    const sinceFilter = since ? { gt: since } : {};

    /** Construit le scope Prisma : where schoolId + updatedAt + deletedAt + extra. */
    const where = (extra: Record<string, unknown> = {}) => ({
      schoolId,
      ...sinceFilter,
      deletedAt: null,
      ...extra,
    });

    const entities: Record<string, unknown[]> = {};

    // --- Users ---
    const userSelect = { id: true, schoolId: true, fullName: true, email: true, role: true, photoUrl: true, parentId: true, parentCode: true, phone: true, gender: true, birthDate: true, matricule: true, isTitulaire: true, active: true, version: true, updatedAt: true };
    if (role === 'ADMIN') {
      entities.users = await db.user.findMany({ where: where(), select: userSelect, take: MAX_ROWS });
    } else if (role === 'TEACHER') {
      entities.users = await db.user.findMany({ where: where({ role: { in: ['TEACHER', 'STUDENT'] } }), select: userSelect, take: MAX_ROWS });
    } else if (role === 'PARENT') {
      const kids = await childrenIds(userId);
      entities.users = await db.user.findMany({ where: where({ id: { in: kids } }), select: userSelect, take: MAX_ROWS });
    } else {
      entities.users = await db.user.findMany({ where: where({ id: userId }), select: userSelect, take: MAX_ROWS });
    }

    // --- Classes ---
    if (role === 'ADMIN') {
      entities.classes = await db.schoolClass.findMany({ where: where(), take: MAX_ROWS });
    } else if (role === 'TEACHER') {
      const tit = await titulaireClassIds(userId);
      entities.classes = await db.schoolClass.findMany({ where: where({ OR: [{ titulaireId: userId }, { id: { in: tit } }] }), take: MAX_ROWS });
    } else {
      const sid = role === 'PARENT' ? (await childrenIds(userId))[0] : userId;
      const ids = await studentClassIds(sid);
      entities.classes = await db.schoolClass.findMany({ where: where({ id: { in: ids } }), take: MAX_ROWS });
    }

    // --- Courses ---
    if (role === 'ADMIN') {
      entities.courses = await db.course.findMany({ where: where(), take: MAX_ROWS });
    } else if (role === 'TEACHER') {
      entities.courses = await db.course.findMany({ where: where({ teacherId: userId }), take: MAX_ROWS });
    } else {
      const sid = role === 'PARENT' ? (await childrenIds(userId))[0] : userId;
      const ids = await studentClassIds(sid);
      entities.courses = await db.course.findMany({ where: where({ classId: { in: ids } }), take: MAX_ROWS });
    }

    // --- Grades ---
    if (role === 'ADMIN') {
      entities.grades = await db.grade.findMany({ where: where(), take: MAX_ROWS });
    } else if (role === 'TEACHER') {
      entities.grades = await db.grade.findMany({ where: where({ teacherId: userId }), take: MAX_ROWS });
    } else {
      const sid = role === 'PARENT' ? (await childrenIds(userId))[0] : userId;
      entities.grades = await db.grade.findMany({ where: where({ studentId: sid }), take: MAX_ROWS });
    }

    // --- Homework ---
    if (role === 'ADMIN') {
      entities.homework = await db.homework.findMany({ where: where(), take: MAX_ROWS });
    } else if (role === 'TEACHER') {
      entities.homework = await db.homework.findMany({ where: where({ teacherId: userId }), take: MAX_ROWS });
    } else {
      const sid = role === 'PARENT' ? (await childrenIds(userId))[0] : userId;
      const ids = await studentClassIds(sid);
      const courses = await db.course.findMany({ where: { classId: { in: ids } }, select: { id: true } });
      entities.homework = await db.homework.findMany({ where: where({ courseId: { in: courses.map((c) => c.id) } }), take: MAX_ROWS });
    }

    // --- Attendance ---
    if (role === 'ADMIN') {
      entities.attendance = await db.attendance.findMany({ where: where(), take: MAX_ROWS });
    } else if (role === 'TEACHER') {
      entities.attendance = await db.attendance.findMany({ where: where({ teacherId: userId }), take: MAX_ROWS });
    } else {
      const sid = role === 'PARENT' ? (await childrenIds(userId))[0] : userId;
      entities.attendance = await db.attendance.findMany({ where: where({ studentId: sid }), take: MAX_ROWS });
    }

    // --- Submissions (pas de updatedAt/deletedAt : delta via submittedAt) ---
    const subSince = since ? { gt: since } : {};
    if (role === 'ADMIN') {
      entities.submissions = await db.submission.findMany({ where: { schoolId, ...subSince }, take: MAX_ROWS });
    } else if (role === 'TEACHER') {
      const courses = await db.course.findMany({ where: { teacherId: userId }, select: { id: true } });
      const hws = await db.homework.findMany({ where: { courseId: { in: courses.map((c) => c.id) } }, select: { id: true } });
      entities.submissions = await db.submission.findMany({ where: { schoolId, homeworkId: { in: hws.map((h) => h.id) }, ...subSince }, take: MAX_ROWS });
    } else {
      const sid = role === 'PARENT' ? (await childrenIds(userId))[0] : userId;
      entities.submissions = await db.submission.findMany({ where: { schoolId, studentId: sid, ...subSince }, take: MAX_ROWS });
    }

    // --- Lessons ---
    if (role === 'ADMIN') {
      entities.lessons = await db.lesson.findMany({ where: where(), take: MAX_ROWS });
    } else if (role === 'TEACHER') {
      entities.lessons = await db.lesson.findMany({ where: where({ teacherId: userId }), take: MAX_ROWS });
    } else {
      const sid = role === 'PARENT' ? (await childrenIds(userId))[0] : userId;
      const ids = await studentClassIds(sid);
      const courses = await db.course.findMany({ where: { classId: { in: ids } }, select: { id: true } });
      entities.lessons = await db.lesson.findMany({ where: where({ courseId: { in: courses.map((c) => c.id) }, isPublished: true }), take: MAX_ROWS });
    }

    // --- Bulletins ---
    if (role === 'ADMIN') {
      entities.bulletins = await db.bulletin.findMany({ where: where(), take: MAX_ROWS });
    } else {
      const sid = role === 'PARENT' ? (await childrenIds(userId))[0] : userId;
      entities.bulletins = await db.bulletin.findMany({ where: where({ studentId: sid }), take: MAX_ROWS });
    }

    // --- Payments ---
    if (role === 'ADMIN') {
      entities.payments = await db.payment.findMany({ where: where(), take: MAX_ROWS });
    } else if (role === 'PARENT') {
      const kids = await childrenIds(userId);
      entities.payments = await db.payment.findMany({ where: where({ studentId: { in: kids } }), take: MAX_ROWS });
    } else if (role === 'STUDENT') {
      entities.payments = await db.payment.findMany({ where: where({ studentId: userId }), take: MAX_ROWS });
    }

    // --- Messages (delta via createdAt) ---
    const msgSince = since ? { gt: since } : {};
    entities.messages = await db.message.findMany({ where: { schoolId, deletedAt: null, OR: [{ senderId: userId }, { recipientId: userId }], createdAt: msgSince }, take: MAX_ROWS });

    // --- Notifications (delta via createdAt) ---
    const notifSince = since ? { gt: since } : {};
    entities.notifications = await db.notification.findMany({ where: { schoolId, deletedAt: null, OR: [{ userId }, { userId: null }], createdAt: notifSince }, take: MAX_ROWS });

    // --- Schedules ---
    if (role === 'ADMIN') {
      entities.schedules = await db.courseSchedule.findMany({ where: where(), take: MAX_ROWS });
    } else {
      const sid = role === 'PARENT' ? (await childrenIds(userId))[0] : userId;
      const ids = await studentClassIds(sid);
      const courses = await db.course.findMany({ where: { classId: { in: ids } }, select: { id: true } });
      entities.schedules = await db.courseSchedule.findMany({ where: where({ courseId: { in: courses.map((c) => c.id) } }), take: MAX_ROWS });
    }

    // --- Resources ---
    entities.resources = await db.ressource.findMany({ where: where({ isPublished: true }), take: MAX_ROWS });

    // --- Periods (Phase 3) ---
    entities.periods = await db.period.findMany({ where: where(), take: MAX_ROWS });

    // --- Fees + Installments (Phase 3) ---
    entities.fees = await db.fee.findMany({ where: where(), take: MAX_ROWS });
    if (role === 'ADMIN') {
      entities.installments = await db.installment.findMany({ where: where(), take: MAX_ROWS });
    } else if (role === 'PARENT') {
      const kids = await childrenIds(userId);
      entities.installments = await db.installment.findMany({ where: where({ studentId: { in: kids } }), take: MAX_ROWS });
    } else if (role === 'STUDENT') {
      entities.installments = await db.installment.findMany({ where: where({ studentId: userId }), take: MAX_ROWS });
    } else {
      // TEACHER : pas de vue personnelle sur les tranches (données financières) → hors scope
      entities.installments = [];
    }

    // --- Events (Phase 3) ---
    if (role === 'STUDENT' || role === 'PARENT') {
      const sid = role === 'PARENT' ? (await childrenIds(userId))[0] : userId;
      const ids = await studentClassIds(sid);
      const tit = await titulaireClassIds(userId);
      const allowed = [...new Set([...ids, ...tit])];
      entities.events = await db.event.findMany({
        where: where({
          OR: [
            { targetType: { not: 'CLASS' } },
            { targetClassId: { in: allowed } },
          ],
        }),
        orderBy: { startsAt: 'asc' },
        take: MAX_ROWS,
      });
    } else {
      entities.events = await db.event.findMany({ where: where(), orderBy: { startsAt: 'asc' }, take: MAX_ROWS });
    }

    // --- AbsenceJustifications (Phase 3) ---
    if (role === 'ADMIN') {
      entities.absenceJustifications = await db.absenceJustification.findMany({ where: where(), take: MAX_ROWS });
    } else if (role === 'TEACHER') {
      entities.absenceJustifications = await db.absenceJustification.findMany({ where: where(), take: MAX_ROWS });
    } else if (role === 'PARENT') {
      const kids = await childrenIds(userId);
      entities.absenceJustifications = await db.absenceJustification.findMany({
        where: where({ OR: [{ explainedById: userId }, { studentId: { in: kids } }] }),
        take: MAX_ROWS,
      });
    } else {
      entities.absenceJustifications = await db.absenceJustification.findMany({
        where: where({ studentId: userId }),
        take: MAX_ROWS,
      });
    }

    // --- GradeSnapshots (Phase 3 — pas de updatedAt/deletedAt : delta via createdAt) ---
    const snapshotSince = since ? { gt: since } : {};
    if (role === 'ADMIN' || role === 'TEACHER') {
      entities.gradeSnapshots = await db.gradeSnapshot.findMany({ where: { schoolId, ...snapshotSince }, take: MAX_ROWS });
    } else {
      const sid = role === 'PARENT' ? (await childrenIds(userId))[0] : userId;
      entities.gradeSnapshots = await db.gradeSnapshot.findMany({ where: { schoolId, studentId: sid, ...snapshotSince }, take: MAX_ROWS });
    }

    return NextResponse.json({
      cursor: cursor.toISOString(),
      entities,
      counts: Object.fromEntries(Object.entries(entities).map(([k, v]) => [k, (v as unknown[]).length])),
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Erreur de synchronisation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
