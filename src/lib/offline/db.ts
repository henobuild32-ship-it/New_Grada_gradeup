import Dexie, { type EntityTable } from 'dexie';
import type { LocalRecord, OutboxAction, SyncMeta } from './types';

/**
 * Base locale Dexie — une table par entité.
 * Toutes les tables partagent l'enveloppe LocalRecord (id, schoolId,
 * updatedAt, version, syncStatus, deletedAt). Les index comprennent
 * schoolId (multi-tenant) et updatedAt (delta pull / purge).
 */
export interface UserRecord extends LocalRecord {
  fullName: string;
  email: string;
  role: string;
  photoUrl?: string;
  parentId?: string | null;
  parentCode?: string | null;
  phone?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  matricule?: string | null;
  isTitulaire?: boolean;
  active?: boolean;
  classEnrollments?: Array<{ classId: string; class: { id: string; name: string; level?: string } }>;
  school?: { id: string; name?: string; logoUrl?: string; academicYear?: string };
}

export interface SchoolClassRecord extends LocalRecord {
  name: string;
  level?: string | null;
  cycle?: string | null;
  section?: string | null;
  titulaireId?: string | null;
}

export interface CourseRecord extends LocalRecord {
  classId: string;
  teacherId: string;
  name: string;
  maxScore?: number;
  coefficient?: number | null;
  status?: string;
  isPublished?: boolean;
}

export interface LessonRecord extends LocalRecord {
  courseId: string;
  teacherId: string;
  title: string;
  content?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  isPublished?: boolean;
}

export interface GradeRecord extends LocalRecord {
  courseId: string;
  studentId: string;
  teacherId: string;
  score: number;
  maxScore: number;
  trimester?: string | number | null;
  semester?: string | null;
  period?: string | null;
  typeEvaluation?: string | null;
  evaluationDate?: string | null;
  status?: string;
  validatedAt?: number | null;
  comment?: string | null;
  effectiveCoefficient?: number;
  course?: { id?: string; name?: string; classId?: string; coefficient?: number };
}

export interface GradeSnapshotRecord extends LocalRecord {
  gradeId: string;
  studentId: string;
  snapshot: Record<string, unknown>;
}

export interface HomeworkRecord extends LocalRecord {
  courseId: string;
  teacherId: string;
  title: string;
  description?: string | null;
  dueDate: string;
  isPublished?: boolean;
  fileUrl?: string | null;
  fileName?: string | null;
}

export interface SubmissionRecord extends LocalRecord {
  homeworkId: string;
  studentId: string;
  fileUrl?: string | null;
  fileName?: string | null;
  content?: string | null;
  submittedAt?: number;
  score?: number | null;
  status?: string;
}

export interface AttendanceRecord extends LocalRecord {
  studentId: string;
  teacherId: string;
  courseId: string;
  date: string;
  status: string;
  reason?: string | null;
}

export interface ScheduleRecord extends LocalRecord {
  courseId: string;
  classId: string;
  courseName: string;
  teacherName: string;
  className?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

export interface ReportCardRecord extends LocalRecord {
  studentId: string;
  classId: string;
  trimester?: number | null;
  academicYear?: string | null;
  averageGrade?: number | null;
  classRank?: number | null;
  mention?: string | null;
  status?: string;
  gradesData?: Record<string, unknown> | null;
}

export interface BulletinRecord extends LocalRecord {
  studentId: string;
  classId: string;
  term?: number | null;
  academicYear?: string | null;
  average?: number | null;
  rank?: number | null;
  mention?: string | null;
  status?: string;
  gradesSnapshot?: Record<string, unknown> | null;
}

export interface PaymentRecord extends LocalRecord {
  studentId: string;
  amount: number;
  currency?: string | null;
  status?: string;
  month?: string | null;
  method?: string | null;
  receiptNumber?: string | null;
  createdAt?: string;
}

export interface MessageRecord extends LocalRecord {
  senderId: string;
  recipientId: string;
  content: string;
  messageType?: string | null;
  attachmentUrl?: string | null;
  replyToId?: string | null;
  read?: boolean;
  createdAtMs?: number;
}

export interface EventRecord extends LocalRecord {
  title: string;
  description?: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
  schoolYearId?: string | null;
}

export interface ResourceRecord extends LocalRecord {
  title: string;
  description?: string | null;
  category?: string | null;
  url?: string | null;
  fileUrl?: string | null;
  type?: string | null;
  isPublished?: boolean;
}

export interface NotificationRecord extends LocalRecord {
  userId?: string | null;
  senderId?: string;
  title: string;
  message: string;
  type?: string | null;
  priority?: string | null;
  read?: boolean;
  metadata?: Record<string, unknown> | null;
}

/** Cache de fichiers lourds téléchargés pour lecture hors ligne. */
export interface OfflineFileRecord {
  url: string;
  fileName?: string | null;
  /** Blob sérialisé via IndexedDB structured clone. */
  blob: Blob;
  size: number;
  downloadedAt: number;
  schoolId: string;
}

class GradeUpLocalDB extends Dexie {
  users!: EntityTable<UserRecord, 'id'>;
  classes!: EntityTable<SchoolClassRecord, 'id'>;
  courses!: EntityTable<CourseRecord, 'id'>;
  lessons!: EntityTable<LessonRecord, 'id'>;
  grades!: EntityTable<GradeRecord, 'id'>;
  gradeSnapshots!: EntityTable<GradeSnapshotRecord, 'id'>;
  homework!: EntityTable<HomeworkRecord, 'id'>;
  submissions!: EntityTable<SubmissionRecord, 'id'>;
  attendance!: EntityTable<AttendanceRecord, 'id'>;
  schedules!: EntityTable<ScheduleRecord, 'id'>;
  reportCards!: EntityTable<ReportCardRecord, 'id'>;
  bulletins!: EntityTable<BulletinRecord, 'id'>;
  payments!: EntityTable<PaymentRecord, 'id'>;
  messages!: EntityTable<MessageRecord, 'id'>;
  events!: EntityTable<EventRecord, 'id'>;
  resources!: EntityTable<ResourceRecord, 'id'>;
  notifications!: EntityTable<NotificationRecord, 'id'>;
  /** File d'attente des mutations hors ligne. */
  outbox!: EntityTable<OutboxAction, 'clientMutationId'>;
  /** Curseurs de synchro et métadonnées. */
  syncMeta!: EntityTable<SyncMeta, 'key'>;
  /** Fichiers lourds disponibles hors ligne. */
  offlineFiles!: EntityTable<OfflineFileRecord, 'url'>;

  constructor() {
    super('gradeup-local');
    this.version(1).stores({
      users: 'id, schoolId, updatedAt, syncStatus, role, parentId',
      classes: 'id, schoolId, updatedAt, syncStatus',
      courses: 'id, schoolId, classId, teacherId, updatedAt, syncStatus',
      lessons: 'id, schoolId, courseId, teacherId, updatedAt, syncStatus',
      grades: 'id, schoolId, courseId, studentId, teacherId, updatedAt, syncStatus',
      gradeSnapshots: 'id, schoolId, gradeId, studentId, updatedAt, syncStatus',
      homework: 'id, schoolId, courseId, teacherId, dueDate, updatedAt, syncStatus',
      submissions: 'id, schoolId, homeworkId, studentId, updatedAt, syncStatus',
      attendance: 'id, schoolId, studentId, teacherId, courseId, date, updatedAt, syncStatus',
      schedules: 'id, schoolId, courseId, dayOfWeek, updatedAt, syncStatus',
      reportCards: 'id, schoolId, studentId, classId, updatedAt, syncStatus',
      bulletins: 'id, schoolId, studentId, classId, term, updatedAt, syncStatus',
      payments: 'id, schoolId, studentId, month, updatedAt, syncStatus',
      messages: 'id, schoolId, senderId, recipientId, createdAt, updatedAt, syncStatus',
      events: 'id, schoolId, startsAt, updatedAt, syncStatus',
      resources: 'id, schoolId, category, updatedAt, syncStatus',
      notifications: 'id, schoolId, userId, read, updatedAt, syncStatus',
      outbox: 'clientMutationId, status, createdAt, entity, schoolId, nextAttemptAt',
      syncMeta: 'key',
      offlineFiles: 'url, schoolId, downloadedAt',
    });
    // Add a class index so schedules can be cached once and filtered locally
    // when a student or teacher switches between their assigned classes.
    this.version(2)
      .stores({
        schedules: 'id, schoolId, classId, courseId, dayOfWeek, updatedAt, syncStatus',
      })
      .upgrade(async (transaction) => {
        const schedules = await transaction.table('schedules').toArray();
        const courses = await transaction.table('courses').toArray();
        const users = await transaction.table('users').toArray();
        const courseById = new Map(courses.map((course) => [String(course.id), course]));
        const userById = new Map(users.map((user) => [String(user.id), String(user.fullName ?? '')]));

        for (const schedule of schedules) {
          const course = courseById.get(String(schedule.courseId));
          if (!course?.classId) continue;
          await transaction.table('schedules').update(schedule.id, {
            classId: course.classId,
            courseName: String(course.name ?? 'Cours'),
            teacherName: userById.get(String(course.teacherId)) || 'Professeur',
            className: String(course.className ?? ''),
          });
        }
      });
  }
}

/** Instance unique (lazy) — évite d'ouvrir IndexedDB côté serveur. */
let dbInstance: GradeUpLocalDB | null = null;

export function getLocalDB(): GradeUpLocalDB {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB indisponible (environnement serveur).');
  }
  if (!dbInstance) {
    dbInstance = new GradeUpLocalDB();
  }
  return dbInstance;
}

/** Ferme et supprime la base locale puis invalide le singleton. */
export async function deleteLocalDB(): Promise<void> {
  const instance = dbInstance;
  if (!instance) return;
  await instance.delete();
  if (dbInstance === instance) dbInstance = null;
}

/** Retourne la table Dexie correspondant à une entité (par nom canonique). */
export function getTable(entity: string): EntityTable<LocalRecord, 'id'> {
  const db = getLocalDB();
  const table = (db as unknown as Record<string, EntityTable<LocalRecord, 'id'>>)[entity];
  if (!table) throw new Error(`Entité inconnue : ${entity}`);
  return table;
}

/** Noms d'entités gérées (utilisé par le purge et le sync serveur). */
export const ENTITY_NAMES = [
  'users',
  'classes',
  'courses',
  'lessons',
  'grades',
  'gradeSnapshots',
  'homework',
  'submissions',
  'attendance',
  'schedules',
  'reportCards',
  'bulletins',
  'payments',
  'messages',
  'events',
  'resources',
  'notifications',
] as const;

export type EntityName = (typeof ENTITY_NAMES)[number];
