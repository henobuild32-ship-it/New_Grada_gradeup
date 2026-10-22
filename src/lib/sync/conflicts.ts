/**
 * Règles de résolution de conflits (partagées client/serveur).
 * Détail complet dans docs/SYNC.md.
 *
 * Résumé :
 * - Notes verrouillées / bulletins validés : le serveur gagne, l'utilisateur est averti.
 * - Présences : dernière écriture par séance + élève.
 * - Messages, soumissions de devoirs : append-only, aucun conflit.
 * - Brouillons de leçons : version la plus récente, avec copie de sauvegarde.
 * - Paiements : JAMAIS créés hors ligne côté serveur sans confirmation
 *   (online-only, cf. ONLINE_ONLY_OPERATIONS).
 */

export type ConflictRule =
  | 'server-wins'
  | 'last-write-wins-per-key'
  | 'append-only'
  | 'latest-with-backup';

/** Règle appliquée par entité. */
export const CONFLICT_RULES: Record<string, ConflictRule> = {
  grades: 'server-wins',
  gradeSnapshots: 'server-wins',
  reportCards: 'server-wins',
  bulletins: 'server-wins',
  attendance: 'last-write-wins-per-key',
  messages: 'append-only',
  submissions: 'append-only',
  lessons: 'latest-with-backup',
  notifications: 'append-only',
  users: 'server-wins',
  classes: 'server-wins',
  courses: 'server-wins',
  homework: 'server-wins',
  schedules: 'server-wins',
  payments: 'server-wins',
  events: 'server-wins',
  resources: 'server-wins',
};

/**
 * Opérations SENSIBLES = online-only. Le serveur refuse toute mutation
 * poussée depuis l'outbox (et le client doit afficher « Connexion requise »).
 */
export const ONLINE_ONLY_OPERATIONS: Array<{ entity: string; operation: 'create' | 'update' | 'delete' }> = [
  { entity: 'payments', operation: 'create' },
  { entity: 'bulletins', operation: 'update' }, // publication/validation officielle
  { entity: 'reportCards', operation: 'update' },
  { entity: 'users', operation: 'delete' },
  { entity: 'users', operation: 'update' }, // changement de rôle / désactivation
];

export function isOnlineOnly(entity: string, operation: 'create' | 'update' | 'delete'): boolean {
  return ONLINE_ONLY_OPERATIONS.some((op) => op.entity === entity && op.operation === operation);
}

export function ruleFor(entity: string): ConflictRule {
  return CONFLICT_RULES[entity] ?? 'server-wins';
}

/**
 * Décide qui gagne un conflit. `serverUpdatedAt` et `clientUpdatedAt` en epoch ms.
 * Retourne 'server' | 'client'. Pour 'server-wins' → toujours 'server'
 * (sauf si le serveur n'a pas de version). Pour LWW → le plus récent.
 */
export function resolveConflict(
  entity: string,
  serverUpdatedAt: number | null,
  clientUpdatedAt: number
): 'server' | 'client' {
  const rule = ruleFor(entity);
  if (rule === 'append-only') return 'client'; // pas de conflit, on append
  if (rule === 'server-wins') return 'server';
  // last-write-wins-per-key et latest-with-backup → le plus récent gagne
  if (serverUpdatedAt === null) return 'client';
  return clientUpdatedAt >= serverUpdatedAt ? 'client' : 'server';
}
