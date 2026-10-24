import { z } from 'zod';

/**
 * Schémas de validation Zod PARTAGÉS client/serveur.
 * Côté serveur : parser le body avant écriture (routes API).
 * Côté client : react-hook-form (zodResolver) ou validation directe.
 * Format d'erreur serveur : `parseOrThrow(schema, body)` → ApiError 400 FR.
 */
export class ValidationError extends Error {
  readonly issues: { path: string; message: string }[];
  constructor(issues: { path: string; message: string }[]) {
    super(issues[0] ? `${issues[0].path} : ${issues[0].message}` : 'Données invalides.');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({ path: i.path.join('.') || '(corps)', message: i.message }))
    );
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Communs
// ---------------------------------------------------------------------------
export const idSchema = z.string().min(1, 'Identifiant requis.');
export const schoolIdSchema = z.string().min(1, 'Établissement requis.');
export const currencySchema = z.enum(['USD', 'CDF'], {
  message: 'Devise invalide (USD ou CDF).',
});

/** Rôle utilisateur. */
export const roleSchema = z.enum(['ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'CAISSIER'], {
  message: 'Rôle invalide.',
});

/** Sexe. */
export const genderSchema = z.enum(['M', 'F'], { message: 'Sexe : M ou F obligatoire.' });

/** Matricule MAT-YYYY-XXXX. */
export const matriculeSchema = z
  .string()
  .regex(/^MAT-\d{4}-\d{4}$/, 'Format attendu : MAT-YYYY-XXXX.');

/** Code parent P-XXXXXX. */
export const parentCodeSchema = z.string().regex(/^P-[A-Z0-9]{6}$/, 'Format attendu : P-XXXXXX.');

const phoneSchema = z
  .string()
  .regex(/^(\+243|0)[0-9]{8,12}$/, 'Numéro invalide (ex : +243 81 234 5678).')
  .optional()
  .or(z.literal(''));

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------
export const createUserSchema = z.object({
  schoolId: schoolIdSchema,
  fullName: z.string().trim().min(3, 'Nom complet (3 car. min).').max(120),
  email: z.string().email('Email invalide.').optional().or(z.literal('')),
  password: z.string().min(8, 'Mot de passe : 8 caractères min.'),
  role: roleSchema,
  gender: genderSchema,
  phone: phoneSchema,
  parentPhone: phoneSchema,
  parentId: idSchema.optional().nullable(),
  specialty: z.string().max(120).optional(),
  qualification: z.string().max(120).optional(),
  birthDate: z.string().max(32).optional(),
  address: z.string().max(240).optional(),
  active: z.boolean().optional(),
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true }).extend({
  password: z.string().min(8).optional(),
});

// ---------------------------------------------------------------------------
// SchoolClass / Course / Schedule
// ---------------------------------------------------------------------------
export const schoolClassSchema = z.object({
  name: z.string().trim().min(2, 'Nom de classe (2 car. min).').max(80),
  level: z.string().max(80).optional(),
  cycle: z.string().max(80).optional(),
  section: z.string().max(80).optional(),
  option: z.string().max(80).optional(),
  fees: z.coerce.number().min(0, 'Frais négatifs.').max(1_000_000),
  titulaireId: idSchema.optional().nullable(),
});

export const courseSchema = z.object({
  classId: idSchema,
  teacherId: idSchema,
  name: z.string().trim().min(2, 'Nom du cours (2 car. min).').max(120),
  maxScore: z.coerce.number().min(1).max(1000).optional(),
  coefficient: z.coerce.number().int().min(1, 'Coefficient ≥ 1.').max(50).optional(),
  weeklyHours: z.coerce.number().min(0).max(60).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  isPublished: z.boolean().optional(),
});

export const scheduleSlotSchema = z.object({
  courseId: idSchema,
  dayOfWeek: z.coerce.number().int().min(0, 'Jour 0-6.').max(6, 'Jour 0-6.'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM.'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM.'),
  room: z.string().max(60).optional(),
}).refine((v) => v.startTime < v.endTime, {
  message: 'L’heure de fin doit suivre l’heure de début.',
  path: ['endTime'],
});

// ---------------------------------------------------------------------------
// Grade
// ---------------------------------------------------------------------------
export const gradeSchema = z.object({
  courseId: idSchema,
  studentId: idSchema,
  score: z.coerce.number().min(0, 'Note ≥ 0.'),
  maxScore: z.coerce.number().min(1, 'Maximum ≥ 1.').max(1000).optional(),
  trimester: z.enum(['1', '2', '3']).optional(),
  period: z.string().max(20).optional(),
  typeEvaluation: z.string().max(60).optional(),
  evaluationDate: z.coerce.date().optional(),
  comment: z.string().max(500).optional(),
}).refine((v) => v.score <= (v.maxScore ?? 20), {
  message: 'La note ne peut dépasser le maximum.',
  path: ['score'],
});

/** Statuts de note. */
export const gradeStatusSchema = z.enum(['DRAFT', 'VALIDATED', 'LOCKED'], {
  message: 'Statut de note invalide.',
});

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------
export const attendanceStatusSchema = z.enum(['present', 'absent', 'late', 'justified'], {
  message: 'Statut de présence invalide.',
});

export const attendanceSchema = z.object({
  studentId: idSchema,
  courseId: idSchema.optional().or(z.literal('')),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue : AAAA-MM-JJ.'),
  status: attendanceStatusSchema,
  reason: z.string().max(500).optional(),
  source: z.enum(['MANUAL', 'QR', 'GPS']).optional(),
});

export const absenceJustificationSchema = z.object({
  attendanceId: idSchema.optional().nullable(),
  studentId: idSchema,
  reason: z.string().trim().min(5, 'Motif : 5 caractères min.').max(1000),
  documentUrl: z.string().max(500).optional(),
});

export const reviewJustificationSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED'], { message: 'Décision : APPROVED ou REJECTED.' }),
  reviewNote: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Payment / Fee / Installment
// ---------------------------------------------------------------------------
export const paymentSchema = z.object({
  studentId: idSchema,
  amount: z.coerce.number().positive('Montant positif.').max(10_000_000),
  currency: currencySchema.optional(),
  installmentId: idSchema.optional(),
  month: z.string().max(40).optional(),
  method: z.enum(['cash', 'mobile', 'virement', 'cheque'], { message: 'Méthode invalide. ' }).optional(),
  status: z.enum(['pending', 'paid', 'late', 'cancelled'], { message: 'Statut invalide. ' }).optional(),
  academicYear: z.string().max(20).optional(),
});

export const feeSchema = z.object({
  name: z.string().trim().min(2, 'Libellé (2 car. min).').max(120),
  amount: z.coerce.number().positive('Montant positif.'),
  classId: idSchema.optional().nullable(),
  currency: currencySchema.optional(),
  dueDate: z.string().max(40).optional(),
  cycle: z.string().max(40).optional(),
  isAnnual: z.boolean().optional(),
});

export const installmentSchema = z.object({
  studentId: idSchema,
  label: z.string().trim().min(2).max(120),
  amount: z.coerce.number().positive('Montant positif.'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue : AAAA-MM-JJ.'),
  feeId: idSchema.optional().nullable(),
  currency: currencySchema.optional(),
});

// ---------------------------------------------------------------------------
// Lesson / Homework / Submission
// ---------------------------------------------------------------------------
export const lessonSchema = z.object({
  courseId: idSchema,
  title: z.string().trim().min(3, 'Titre (3 car. min).').max(200),
  content: z.string().max(20_000).optional(),
  fileUrl: z.string().max(500).optional(),
  fileName: z.string().max(200).optional(),
  isPublished: z.boolean().optional(),
});

export const homeworkSchema = z.object({
  courseId: idSchema,
  title: z.string().trim().min(3, 'Titre (3 car. min).').max(200),
  description: z.string().max(10_000).optional(),
  dueDate: z.string().max(40).optional(),
  isPublished: z.boolean().optional(),
  gradingType: z.enum(['manual', 'auto']).optional(),
  fileUrl: z.string().max(500).optional(),
  fileName: z.string().max(200).optional(),
});

export const submissionSchema = z.object({
  homeworkId: idSchema,
  content: z.string().max(20_000).optional(),
  fileUrl: z.string().max(500).optional(),
  fileName: z.string().max(200).optional(),
});

export const gradeSubmissionSchema = z.object({
  score: z.coerce.number().min(0, 'Note ≥ 0.'),
  maxScore: z.coerce.number().min(1).max(1000).optional(),
  comment: z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Message / Conversation
// ---------------------------------------------------------------------------
export const messageSchema = z.object({
  recipientId: idSchema,
  content: z.string().trim().min(1, 'Message vide.').max(5000, 'Message trop long (5000 max).'),
  messageType: z.enum(['text', 'file', 'image']).optional(),
  attachmentUrl: z.string().max(500).optional(),
  attachmentName: z.string().max(200).optional(),
  replyToId: idSchema.optional().nullable(),
});

// ---------------------------------------------------------------------------
// Bulletin / ReportCard (workflow double validation)
// ---------------------------------------------------------------------------
export const bulletinStatusSchema = z.enum(
  ['DRAFT', 'PENDING_TITULAIRE', 'VALIDATED_TITULAIRE', 'PENDING_ADMIN', 'VALIDATED_ADMIN', 'PUBLISHED'],
  { message: 'Statut de bulletin invalide.' }
);

/** Transition autorisée par rôle : DRAFT → PENDING_TITULAIRE → VALIDATED_TITULAIRE
 *  → PENDING_ADMIN → VALIDATED_ADMIN → PUBLISHED */
export const BULLETIN_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_TITULAIRE'],
  PENDING_TITULAIRE: ['VALIDATED_TITULAIRE', 'DRAFT'],
  VALIDATED_TITULAIRE: ['PENDING_ADMIN'],
  PENDING_ADMIN: ['VALIDATED_ADMIN', 'VALIDATED_TITULAIRE'],
  VALIDATED_ADMIN: ['PUBLISHED'],
  PUBLISHED: [],
};

export const bulletinTransitionSchema = z.object({
  action: z.enum(['submit', 'validate_titulaire', 'validate_admin', 'publish', 'reopen'], {
    message: 'Action invalide.',
  }),
  appreciation: z.string().max(1000).optional(),
  term: z.coerce.number().int().min(1).max(3).optional(),
  academicYear: z.string().max(20).optional(),
});

// ---------------------------------------------------------------------------
// Ressource / Event / Notification
// ---------------------------------------------------------------------------
export const resourceVisibilitySchema = z.enum(['PUBLIC', 'SCHOOL', 'CLASS', 'PRIVATE'], {
  message: 'Visibilité invalide (PUBLIC, SCHOOL, CLASS, PRIVATE).',
});

export const resourceSchema = z.object({
  title: z.string().trim().min(3, 'Titre (3 car. min).').max(200),
  description: z.string().max(5000).optional(),
  category: z.string().max(80).optional(),
  url: z.string().max(500).optional(),
  fileUrl: z.string().max(500).optional(),
  type: z.enum(['LIEN', 'FICHIER', 'VIDEO', 'DEVOIR']).optional(),
  visibility: resourceVisibilitySchema.optional(),
  targetClassId: idSchema.optional().or(z.literal('')),
  isPublished: z.boolean().optional(),
});

export const eventSchema = z.object({
  title: z.string().trim().min(3, 'Titre (3 car. min).').max(200),
  description: z.string().max(5000).optional(),
  startsAt: z.coerce.date({ message: 'Début requis.' }),
  endsAt: z.coerce.date().optional().nullable(),
  location: z.string().max(200).optional(),
  targetType: z.enum(['SCHOOL', 'CLASS', 'ROLE']).optional(),
  targetClassId: idSchema.optional().or(z.literal('')),
});

export const notificationSchema = z.object({
  title: z.string().trim().min(2).max(200),
  message: z.string().trim().min(2).max(2000),
  type: z.string().max(40).optional(),
  userId: idSchema.optional().nullable(),
  targetRole: z.string().max(20).optional(),
  targetClassId: idSchema.optional().or(z.literal('')),
});

export const notificationPreferenceSchema = z.object({
  inApp: z.boolean().optional(),
  push: z.boolean().optional(),
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  mutedTypes: z.array(z.string().max(40)).max(50).optional(),
});

// ---------------------------------------------------------------------------
// Period / SchoolYear / CotationRule
// ---------------------------------------------------------------------------
export const periodSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(20),
  trimester: z.coerce.number().int().min(1).max(3).optional(),
  semester: z.coerce.number().int().min(1).max(2).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue : AAAA-MM-JJ.'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue : AAAA-MM-JJ.'),
  schoolYearId: idSchema.optional().or(z.literal('')),
}).refine((v) => v.startDate <= v.endDate, {
  message: 'La fin doit suivre le début.',
  path: ['endDate'],
});

export const subjectRuleSchema = z.object({
  classId: idSchema,
  courseId: idSchema,
  academicYear: z.string().min(4).max(20),
  semester: z.coerce.number().int().min(1).max(2).optional().nullable(),
  maximumPoints: z.coerce.number().positive().max(1000).optional(),
  dailyWorkMaximum: z.coerce.number().min(0).max(1000).optional(),
  examMaximum: z.coerce.number().min(0).max(1000).optional(),
  coefficient: z.coerce.number().int().min(1).max(50).optional().nullable(),
  isQualitative: z.boolean().optional(),
});

export const gradingDecisionRuleSchema = z.object({
  classId: idSchema.optional().nullable(),
  cycle: z.string().max(40).optional(),
  academicYear: z.string().min(4).max(20),
  passPercentage: z.coerce.number().min(0).max(100).optional(),
  retakeMinPercentage: z.coerce.number().min(0).max(100).optional(),
  maxFailedCourses: z.coerce.number().int().min(0).max(50).optional(),
  eliminationPercentage: z.coerce.number().min(0).max(100).optional().nullable(),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Types générés partagés (client + serveur)
// ---------------------------------------------------------------------------
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type SchoolClassInput = z.infer<typeof schoolClassSchema>;
export type CourseInput = z.infer<typeof courseSchema>;
export type GradeInput = z.infer<typeof gradeSchema>;
export type AttendanceInput = z.infer<typeof attendanceSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type FeeInput = z.infer<typeof feeSchema>;
export type InstallmentInput = z.infer<typeof installmentSchema>;
export type LessonInput = z.infer<typeof lessonSchema>;
export type HomeworkInput = z.infer<typeof homeworkSchema>;
export type SubmissionInput = z.infer<typeof submissionSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
export type BulletinAction = z.infer<typeof bulletinTransitionSchema>;
export type EventInput = z.infer<typeof eventSchema>;
export type ResourceInput = z.infer<typeof resourceSchema>;
export type PeriodInput = z.infer<typeof periodSchema>;
