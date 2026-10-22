import { db } from '@/lib/db';

/**
 * Règles métier serveur — Phase 3.
 * Numérotation des reçus, matricule auto, détection de conflits d'horaires.
 */

// ---------------------------------------------------------------------------
// 1. Numérotation unique des reçus de paiement (attribuée PAR LE SERVEUR).
//    Format : REC-<annee>-<séquence 6 chiffres> (globale par école).
//    L'unicité est garantie par la contrainte `Payment_receiptNumber_key` ;
//    on boucle sur collision (P2002).
// ---------------------------------------------------------------------------
export async function nextReceiptNumber(schoolId: string, year = new Date().getFullYear()): Promise<string> {
  const prefix = `REC-${year}-`;
  const last = await db.payment.findFirst({
    where: { schoolId, receiptNumber: { startsWith: prefix } },
    orderBy: { receiptNumber: 'desc' },
    select: { receiptNumber: true },
  });
  const seq = last?.receiptNumber ? parseInt(last.receiptNumber.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(seq + 1).padStart(6, '0')}`;
}

/** Génère un reçu (avec retry sur collision d'unicité). */
export async function assignReceiptNumber(schoolId: string, year?: number): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = await nextReceiptNumber(schoolId, year);
    const clash = await db.payment.findUnique({ where: { receiptNumber: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  // Fallback : suffixe à base aléatoire (collision quasi impossible).
  return `REC-${year ?? new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

// ---------------------------------------------------------------------------
// 2. Matricule auto : MAT-YYYY-XXXX (unicité par école + année).
// ---------------------------------------------------------------------------
export async function generateMatricule(schoolId: string, year = new Date().getFullYear()): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = `MAT-${year}-${String(1000 + Math.floor(Math.random() * 9000))}`;
    const existing = await db.user.findFirst({
      where: { schoolId, matricule: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error('Impossible de générer un matricule unique.');
}

/** Validation du format (partagée client/serveur via zod, double barrière). */
export const MATRICULE_REGEX = /^MAT-\d{4}-\d{4}$/;

// ---------------------------------------------------------------------------
// 3. Détection de conflits d'horaires.
//    Retourne les conflits : même prof / même salle / même classe à cheval.
// ---------------------------------------------------------------------------
export interface ScheduleSlotInput {
  courseId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
}

export interface ScheduleConflict {
  type: 'TEACHER' | 'ROOM' | 'CLASS';
  message: string;
  conflictingScheduleId: string;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Vérifie les conflits d'horaire pour un créneau à créer/modifier.
 * @param schoolId école courante
 * @param slot     créneau à valider
 * @param excludeScheduleId id à ignorer en cas d'édition
 */
export async function detectScheduleConflicts(
  schoolId: string,
  slot: ScheduleSlotInput,
  excludeScheduleId?: string
): Promise<ScheduleConflict[]> {
  const sameDay = await db.courseSchedule.findMany({
    where: { schoolId, dayOfWeek: slot.dayOfWeek, ...(excludeScheduleId ? { id: { not: excludeScheduleId } } : {}) },
    include: { course: { select: { id: true, teacherId: true, classId: true, name: true } } },
  });

  const conflicts: ScheduleConflict[] = [];
  for (const other of sameDay) {
    if (!overlaps(slot.startTime, slot.endTime, other.startTime, other.endTime)) continue;

    // Même professeur ?
    if (other.course.teacherId && other.courseId !== slot.courseId) {
      const slotCourse = await db.course.findUnique({
        where: { id: slot.courseId },
        select: { teacherId: true, name: true },
      });
      if (slotCourse && slotCourse.teacherId === other.course.teacherId) {
        conflicts.push({
          type: 'TEACHER',
          message: `Conflit enseignant : ${slotCourse.name} chevauche ${other.course.name} (${other.startTime}–${other.endTime}).`,
          conflictingScheduleId: other.id,
        });
      }
    }
    // Même classe ?
    const slotCourse2 = await db.course.findUnique({
      where: { id: slot.courseId },
      select: { classId: true, name: true },
    });
    if (slotCourse2 && slotCourse2.classId === other.course.classId) {
      conflicts.push({
        type: 'CLASS',
        message: `Conflit de classe : ${slotCourse2.name} chevauche ${other.course.name} (${other.startTime}–${other.endTime}).`,
        conflictingScheduleId: other.id,
      });
    }
    // Même salle (si renseignée) ?
    if (slot.room && other.room && slot.room === other.room) {
      conflicts.push({
        type: 'ROOM',
        message: `Salle ${slot.room} occupée (${other.startTime}–${other.endTime}).`,
        conflictingScheduleId: other.id,
      });
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------------------
// 4. Seuils RDC (configurables par école via GradingDecisionRule).
// ---------------------------------------------------------------------------
export interface RdcThresholds {
  passPercentage: number;
  retakeMinPercentage: number;
  maxFailedCourses: number;
  eliminationPercentage: number | null;
}

export const DEFAULT_RDC_THRESHOLDS: RdcThresholds = {
  passPercentage: 50,
  retakeMinPercentage: 45,
  maxFailedCourses: 2,
  eliminationPercentage: null,
};

/** Charge les seuils RDC (classe → sinon école → sinon défaut). */
export async function getRdcThresholds(
  schoolId: string,
  classId?: string | null
): Promise<RdcThresholds> {
  try {
    const specific = classId
      ? await db.gradingDecisionRule.findFirst({
          where: { schoolId, classId, isActive: true },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    const fallback = specific ??
      (await db.gradingDecisionRule.findFirst({
        where: { schoolId, classId: null, isActive: true },
        orderBy: { createdAt: 'desc' },
      }));
    if (!fallback) return DEFAULT_RDC_THRESHOLDS;
    return {
      passPercentage: fallback.passPercentage,
      retakeMinPercentage: fallback.retakeMinPercentage,
      maxFailedCourses: fallback.maxFailedCourses,
      eliminationPercentage: fallback.eliminationPercentage,
    };
  } catch {
    return DEFAULT_RDC_THRESHOLDS;
  }
}
