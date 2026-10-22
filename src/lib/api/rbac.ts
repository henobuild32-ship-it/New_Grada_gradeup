import type { NextRequest } from 'next/server';
import { authenticateRequest } from '@/lib/auth/authenticate';
import type { AuthUser } from '@/lib/auth/authenticate';
import { db } from '@/lib/db';
import { ApiError } from './errors';

export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT' | 'CAISSIER';
export const ALL_ROLES: Role[] = ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'CAISSIER'];

/**
 * Garde d'autorisation centralisée (RBAC + multi-tenant + propriété).
 * Remplace les checks inline dupliqués dans les routes.
 *
 * Usage :
 *   const auth = await requireAuth(req);                       // 401 si absent
 *   const auth = await requireAuth(req, ['ADMIN']);            // 403 si rôle
 *   const auth = await requireAuth(req, ['ADMIN','TEACHER']);
 *   assertSchool(auth, schoolId);                              // 403 inter-école
 *   assertSelfOrRole(auth, userId, ['ADMIN','PARENT']);        // ownership
 */
export async function requireAuth(req: NextRequest, roles?: Role[]): Promise<AuthUser> {
  const auth = await authenticateRequest(req);
  if (roles && roles.length > 0 && !roles.includes(auth.role as Role)) {
    throw new ApiError('Accès refusé : rôle insuffisant.', 403, 'ROLE_FORBIDDEN');
  }
  return auth;
}

/** Version avec vérification compte actif en base (routes sensibles). */
export async function requireActiveAuth(req: NextRequest, roles?: Role[]): Promise<AuthUser> {
  const auth = await requireAuth(req, roles);
  const user = await db.user.findUnique({
    where: { id: auth.userId },
    select: { active: true, deletedAt: true },
  });
  if (!user || !user.active || user.deletedAt) {
    throw new ApiError('Compte désactivé ou supprimé.', 403, 'ACCOUNT_DISABLED');
  }
  return auth;
}

/** Multi-tenant : le record appartient-il à l'école de la session ? */
export function assertSchool(auth: AuthUser, schoolId: string | null | undefined): void {
  if (!schoolId || schoolId !== auth.schoolId) {
    throw new ApiError('Accès refusé : ressource d’un autre établissement.', 403, 'TENANT_FORBIDDEN');
  }
}

/** Self ou rôle autorisé. */
export function assertSelfOrRole(auth: AuthUser, userId: string, roles: Role[]): void {
  if (auth.userId === userId) return;
  if (roles.includes(auth.role as Role)) return;
  throw new ApiError('Accès refusé : ownership.', 403, 'OWNERSHIP_FORBIDDEN');
}

/** Self uniquement (ou admin de l'école). */
export function assertSelfOrAdmin(auth: AuthUser, userId: string): void {
  if (auth.userId === userId || auth.role === 'ADMIN') return;
  throw new ApiError('Accès refusé : réservé au propriétaire ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
}

/** Élève → ses données. */
export function assertSelfIfStudent(auth: AuthUser, studentId: string): void {
  if (auth.role === 'STUDENT' && auth.userId !== studentId) {
    throw new ApiError('Accès refusé : un élève ne voit que ses données.', 403, 'OWNERSHIP_FORBIDDEN');
  }
}

/** Parent → ses enfants (lookup DB). Lève 403 si l'utilisateur n'est pas enfant. */
export async function assertParentChild(auth: AuthUser, studentId: string): Promise<void> {
  if (auth.role !== 'PARENT') return;
  if (auth.userId === studentId) return;
  const child = await db.user.findFirst({
    where: { id: studentId, parentId: auth.userId, deletedAt: null },
    select: { id: true },
  });
  if (!child) throw new ApiError('Accès refusé : ce compte n’est pas votre enfant.', 403, 'OWNERSHIP_FORBIDDEN');
}

/** Parent ou élève sur une donnée scolaire liée à un étudiant. */
export async function assertStudentScope(auth: AuthUser, studentId: string): Promise<void> {
  if (auth.role === 'ADMIN' || auth.role === 'TEACHER' || auth.role === 'CAISSIER') return;
  if (auth.role === 'STUDENT') {
    if (auth.userId !== studentId) {
      throw new ApiError('Accès refusé : un élève ne voit que ses données.', 403, 'OWNERSHIP_FORBIDDEN');
    }
    return;
  }
  // PARENT
  await assertParentChild(auth, studentId);
}

/** Prof → son cours. Titulaire ou admin acceptés selon `allowTitulaire`. */
export async function assertTeacherCourse(
  auth: AuthUser,
  courseId: string,
  opts: { allowTitulaire?: boolean } = {}
): Promise<void> {
  if (auth.role === 'ADMIN') return;
  if (auth.role !== 'TEACHER') {
    throw new ApiError('Accès refusé : réservé aux enseignants.', 403, 'ROLE_FORBIDDEN');
  }
  const course = await db.course.findUnique({ where: { id: courseId }, select: { teacherId: true, classId: true } });
  if (!course) throw new ApiError('Cours introuvable.', 404);
  if (course.teacherId === auth.userId) return;
  if (opts.allowTitulaire) {
    const titular = await db.schoolClass.findFirst({
      where: { id: course.classId, titulaireId: auth.userId },
      select: { id: true },
    });
    if (titular) return;
  }
  throw new ApiError('Accès refusé : ce cours n’est pas le vôtre.', 403, 'OWNERSHIP_FORBIDDEN');
}

/** Titulaire de classe ou admin. */
export async function assertTitulaireClass(auth: AuthUser, classId: string): Promise<void> {
  if (auth.role === 'ADMIN') return;
  const klass = await db.schoolClass.findUnique({ where: { id: classId }, select: { titulaireId: true } });
  if (!klass || klass.titulaireId !== auth.userId) {
    throw new ApiError('Accès refusé : réservé au titulaire de la classe ou à l’administration.', 403, 'OWNERSHIP_FORBIDDEN');
  }
}

/** ID d'enfants d'un parent (pour les where scopes). */
export async function childrenIds(parentId: string): Promise<string[]> {
  const children = await db.user.findMany({
    where: { parentId, deletedAt: null },
    select: { id: true },
  });
  return children.map((c) => c.id);
}

/**
 * Where-builder « lecture par rôle » réutilisable pour les listes :
 * ADMIN → toute l'école ; TEACHER → ses cours ; STUDENT → lui ;
 * PARENT → ses enfants. À combiner avec `schoolId: auth.schoolId`.
 */
export async function scopedStudentIds(auth: AuthUser): Promise<string[] | null> {
  // null = pas de restriction par étudiant (admin/teacher non concerné)
  if (auth.role === 'STUDENT') return [auth.userId];
  if (auth.role === 'PARENT') return childrenIds(auth.userId);
  return null;
}

/** Cours d'un enseignant (ids) — pour filtrer lessons/homework/grades. */
export async function teacherCourseIds(teacherId: string): Promise<string[]> {
  const courses = await db.course.findMany({ where: { teacherId }, select: { id: true } });
  return courses.map((c) => c.id);
}

/** Classes d'un titulaire (ids). */
export async function titulaireClassIds(titulaireId: string): Promise<string[]> {
  const classes = await db.schoolClass.findMany({ where: { titulaireId }, select: { id: true } });
  return classes.map((c) => c.id);
}

/**
 * Wrapper générique : exécute un handler avec gestion d'erreurs uniforme.
 * (Alternative légère au try/catch répété dans chaque route.)
 */
export async function withApi<T>(
  fn: () => Promise<T>,
  errorMapper: (e: unknown) => unknown
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw errorMapper(e);
  }
}
