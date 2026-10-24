import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifyUser } from '@/services/notifications/notificationEngine';
import { authenticateRequestActive, AuthError } from '@/lib/auth/authenticate';
import { rateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { auditFromRequest } from '@/lib/api/audit';
import { detectScheduleConflicts } from '@/lib/business/rules';

export const runtime = 'nodejs';

// POST /api/ai/actions — Execute actions triggered by Gradie AI
// Body: { action: string, params: object, userId: string, schoolId: string }
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequestActive(request);
    if (auth.role !== 'ADMIN') return NextResponse.json({ error: 'Actions IA réservées à l’administration.' }, { status: 403 });
    const rate = rateLimit(`ai-action:${auth.userId}`, 20, 60_000);
    if (!rate.ok) return NextResponse.json(rateLimitResponse(rate.retryAfterSeconds), { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
    const { action, params } = await request.json();
    const userId = auth.userId;
    const schoolId = auth.schoolId;

    if (!action || !userId || !schoolId) {
      return NextResponse.json({ error: 'action, userId, schoolId requis' }, { status: 400 });
    }

    let result: unknown;

    switch (action) {
      // ── CREATE CLASSES ──────────────────────────────────────────────────
      case 'create_classes': {
        const { classes } = params as { classes: Array<{ name: string; level?: string; cycle?: string; section?: string; option?: string; fees?: number }> };
        if (!classes || !Array.isArray(classes) || classes.length === 0) {
          return NextResponse.json({ error: 'classes array requis' }, { status: 400 });
        }

        const created: Array<{ id: string; name: string; level: string }> = [];
        const errors: Array<{ name: string; error: string }> = [];

        for (const cls of classes) {
          try {
            const existing = await db.schoolClass.findFirst({
              where: { schoolId, name: cls.name },
            });
            if (existing) {
              errors.push({ name: cls.name, error: 'Classe déjà existante' });
              continue;
            }
            const newClass = await db.schoolClass.create({
              data: {
                schoolId,
                name: cls.name,
                level: cls.level || 'Secondaire',
                cycle: (cls.level || 'Secondaire') === 'Secondaire'
                  ? (cls.cycle === 'Humanites' ? 'Humanites' : 'EB')
                  : cls.level || 'Primaire',
                section: (cls.level || 'Secondaire') === 'Secondaire' && cls.cycle === 'Humanites' ? cls.section?.trim() || '' : '',
                option: (cls.level || 'Secondaire') === 'Secondaire' && cls.cycle === 'Humanites' ? cls.option?.trim() || '' : '',
                fees: cls.fees || 0,
              },
              include: {
                _count: { select: { enrollments: true, courses: true } },
              },
            });
            created.push({ id: newClass.id, name: newClass.name, level: newClass.level });
          } catch (err) {
            errors.push({ name: cls.name, error: err instanceof Error ? err.message : 'Erreur inconnue' });
          }
        }

        // Notify everyone
        if (created.length > 0) {
          try {
            await notifyUser({
              schoolId,
              title: `${created.length} classe(s) créée(s) par Gradie 🏫`,
              message: created.map(c => `• ${c.name} (${c.level})`).join('\n'),
              type: 'CLASS',
              priority: 'NORMAL',
              targetRole: 'ALL',
            });
          } catch { /* non-blocking */ }
        }

        result = { created, errors, total: created.length };
        break;
      }

      // ── DELETE CLASS ────────────────────────────────────────────────────
      case 'delete_class': {
        const { classId } = params as { classId: string };
        if (!classId) {
          return NextResponse.json({ error: 'classId requis' }, { status: 400 });
        }

        const cls = await db.schoolClass.findFirst({ where: { id: classId, schoolId } });
        if (!cls) {
          return NextResponse.json({ error: 'Classe non trouvée' }, { status: 404 });
        }

        const [enrollmentCount, courseCount] = await Promise.all([
          db.enrolledClass.count({ where: { classId } }),
          db.course.count({ where: { classId, deletedAt: null } }),
        ]);
        if (enrollmentCount || courseCount) {
          return NextResponse.json({ error: 'Cette classe contient des élèves ou des cours. Supprimez ou transférez-les depuis l’écran Classes.' }, { status: 409 });
        }

        await db.schoolClass.delete({ where: { id: classId } });
        result = { deleted: { id: cls.id, name: cls.name } };
        break;
      }

      // ── LIST CLASSES ────────────────────────────────────────────────────
      case 'list_classes': {
        const classes = await db.schoolClass.findMany({
          where: { schoolId },
          include: {
            _count: { select: { enrollments: true, courses: true } },
          },
          orderBy: { name: 'asc' },
        });
        result = { classes };
        break;
      }

      // ── LIST COURSES ────────────────────────────────────────────────────
      case 'list_courses': {
        const { classId } = params as { classId?: string };
        const where: Record<string, unknown> = { schoolId };
        if (classId) where.classId = classId;

        const courses = await db.course.findMany({
          where,
          include: {
            class: { select: { id: true, name: true, level: true } },
            teacher: { select: { id: true, fullName: true } },
            _count: { select: { lessons: true, grades: true, homework: true } },
          },
          orderBy: { name: 'asc' },
        });
        result = { courses };
        break;
      }

      // ── CREATE SCHEDULE ─────────────────────────────────────────────────
      case 'create_schedule': {
        const { courseId, dayOfWeek, startTime, endTime, room } = params as {
          courseId: string; dayOfWeek: number; startTime: string; endTime: string; room?: string;
        };

        if (!courseId || dayOfWeek === undefined || !startTime || !endTime) {
          return NextResponse.json({ error: 'courseId, dayOfWeek, startTime, endTime requis' }, { status: 400 });
        }

        const course = await db.course.findFirst({ where: { id: courseId, schoolId } });
        if (!course) {
          return NextResponse.json({ error: 'Cours introuvable' }, { status: 404 });
        }

        const day = Number(dayOfWeek);
        if (!Number.isInteger(day) || day < 1 || day > 7 || startTime >= endTime) {
          return NextResponse.json({ error: 'Jour ou plage horaire invalide.' }, { status: 400 });
        }
        const conflicts = await detectScheduleConflicts(schoolId, { courseId, dayOfWeek: day, startTime, endTime, room: room || '' });
        if (conflicts.length) return NextResponse.json({ error: 'Conflit d’horaire détecté.', conflicts }, { status: 409 });

        const schedule = await db.courseSchedule.create({
          data: {
            courseId,
            schoolId,
            dayOfWeek: day,
            startTime,
            endTime,
            room: room || '',
            exceptions: '[]',
          },
          include: {
            course: {
              include: {
                class: { select: { id: true, name: true } },
                teacher: { select: { id: true, fullName: true } },
              },
            },
          },
        });

        result = { schedule };
        break;
      }

      // ── BULK CREATE SCHEDULE ────────────────────────────────────────────
      case 'bulk_create_schedule': {
        const { slots } = params as { slots: Array<{
          courseId: string; dayOfWeek: number; startTime: string; endTime: string; room?: string;
        }> };

        if (!slots || !Array.isArray(slots) || slots.length === 0) {
          return NextResponse.json({ error: 'slots array requis' }, { status: 400 });
        }

        const created: unknown[] = [];
        const errors: Array<{ slot: string; error: string }> = [];

        for (const slot of slots) {
          try {
            const course = await db.course.findFirst({ where: { id: slot.courseId, schoolId } });
            if (!course) {
              errors.push({ slot: `${slot.courseId}@${slot.dayOfWeek}`, error: 'Cours introuvable' });
              continue;
            }
            const day = Number(slot.dayOfWeek);
            if (!Number.isInteger(day) || day < 1 || day > 7 || !slot.startTime || !slot.endTime || slot.startTime >= slot.endTime) {
              errors.push({ slot: `${slot.courseId}@${slot.dayOfWeek}`, error: 'Jour ou plage horaire invalide.' });
              continue;
            }
            const conflicts = await detectScheduleConflicts(schoolId, { courseId: slot.courseId, dayOfWeek: day, startTime: slot.startTime, endTime: slot.endTime, room: slot.room || '' });
            if (conflicts.length) {
              errors.push({ slot: `${slot.courseId}@${slot.dayOfWeek}`, error: 'Conflit d’horaire.' });
              continue;
            }
            const s = await db.courseSchedule.create({
              data: {
                courseId: slot.courseId,
                schoolId,
                dayOfWeek: day,
                startTime: slot.startTime,
                endTime: slot.endTime,
                room: slot.room || '',
                exceptions: '[]',
              },
              include: {
                course: {
                  include: {
                    class: { select: { id: true, name: true } },
                    teacher: { select: { id: true, fullName: true } },
                  },
                },
              },
            });
            created.push(s);
          } catch (err) {
            errors.push({ slot: `${slot.courseId}@${slot.dayOfWeek}`, error: err instanceof Error ? err.message : 'Erreur' });
          }
        }

        result = { created, errors, total: created.length };
        break;
      }

      // ── DELETE SCHEDULE ─────────────────────────────────────────────────
      case 'delete_schedule': {
        const { scheduleId } = params as { scheduleId: string };
        if (!scheduleId) {
          return NextResponse.json({ error: 'scheduleId requis' }, { status: 400 });
        }
        const existing = await db.courseSchedule.findFirst({ where: { id: scheduleId, schoolId, deletedAt: null }, select: { id: true } });
        if (!existing) return NextResponse.json({ error: 'Créneau introuvable dans votre établissement.' }, { status: 404 });
        await db.courseSchedule.delete({ where: { id: existing.id } });
        result = { deleted: scheduleId };
        break;
      }

      // ── UPDATE SCHEDULE ─────────────────────────────────────────────────
      case 'update_schedule': {
        const { scheduleId, startTime, endTime, room, dayOfWeek } = params as {
          scheduleId: string; startTime?: string; endTime?: string; room?: string; dayOfWeek?: number;
        };
        if (!scheduleId) {
          return NextResponse.json({ error: 'scheduleId requis' }, { status: 400 });
        }
        const existing = await db.courseSchedule.findFirst({ where: { id: scheduleId, schoolId, deletedAt: null } });
        if (!existing) return NextResponse.json({ error: 'Créneau introuvable dans votre établissement.' }, { status: 404 });
        const nextDay = dayOfWeek === undefined ? existing.dayOfWeek : Number(dayOfWeek);
        const nextStart = startTime ?? existing.startTime;
        const nextEnd = endTime ?? existing.endTime;
        const nextRoom = room ?? existing.room;
        if (!Number.isInteger(nextDay) || nextDay < 1 || nextDay > 7 || nextStart >= nextEnd) {
          return NextResponse.json({ error: 'Jour ou plage horaire invalide.' }, { status: 400 });
        }
        const conflicts = await detectScheduleConflicts(schoolId, { courseId: existing.courseId, dayOfWeek: nextDay, startTime: nextStart, endTime: nextEnd, room: nextRoom || '' }, scheduleId);
        if (conflicts.length) return NextResponse.json({ error: 'Conflit d’horaire détecté.', conflicts }, { status: 409 });
        const schedule = await db.courseSchedule.update({
          where: { id: existing.id },
          data: {
            ...(startTime !== undefined && { startTime }),
            ...(endTime !== undefined && { endTime }),
            ...(room !== undefined && { room }),
            ...(dayOfWeek !== undefined && { dayOfWeek: nextDay }),
          },
          include: {
            course: {
              include: {
                class: { select: { id: true, name: true } },
                teacher: { select: { id: true, fullName: true } },
              },
            },
          },
        });
        result = { schedule };
        break;
      }

      default:
        return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 });
    }

    await auditFromRequest(request, {
      schoolId,
      userId,
      action: 'AI_ACTION',
      entity: 'AIAction',
      entityId: action,
      after: { action },
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[AI Actions] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
