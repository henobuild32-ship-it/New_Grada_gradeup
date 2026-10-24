# PHASE 3 — Backend complet et sécurisé

> Statut : **socle livré, vérification/raccordement encore ouvert**. Une base PostgreSQL de développement isolée est maintenant joignable localement; cela ne certifie pas la base distante ni la production.
> Base : la migration + le seed s'appliquent sur une base joignable
> (`npx prisma migrate deploy && npm run db:seed`) — la base de démo
> distante n'est pas accessible depuis le poste de développement hors VPN.

## Mise à jour sécurité/runtime — 2026-10-23

- `POST /api/parent-code` vérifie le rôle ADMIN, l’appartenance de l’élève au même `schoolId`, le rôle STUDENT et la suppression logique. Les codes utilisent `crypto.randomInt` et retentent les collisions uniques.
- `GET /api/report-cards` n’expose aux élèves et parents que les bulletins `published`, limite les professeurs à leurs classes et refuse les autres rôles. Les filtres de statut sont validés.
- `PUT /api/report-cards` impose l’ordre `draft/auto_draft → pending_admin → validated → published`, exige le titulaire pour la transmission, réserve validation/publication à ADMIN et fait un update conditionnel sur le statut précédent. L’écran de synchronisation présente désormais les étapes séparément.
- `GET /api/payments` ne modifie plus les paiements ni ne déclenche de notifications en lecture; les retards sont calculés depuis la date, et le listing global est refusé aux enseignants.
- Les notifications ont été resserrées : diffusion par `POST /api/notifications` réservée à ADMIN, payload validé Zod, expéditeur forcé depuis la session, cible de classe vérifiée dans l'école. Le GET filtre désormais aussi les annonces de classe pour les classes réellement liées au profil.
- Le flux temps réel navigateur passe par le SSE authentifié (`authenticateRequestActive`) et les règles de destinataire du serveur ; le client ne s'abonne plus aux lignes brutes `Notification` avec une clé anon. Les diffusions de classe sont distribuées aux élèves, professeurs, titulaires et parents rattachés à la classe.
- `npm run test:rbac` : **79/79** contrôles réussis sur le serveur local et la base isolée; les tests couvrent l’IDOR du code parent, les bulletins publiés, le refus de publication sans validation, les scopes sync, les filtres de notifications, les refus d'écriture pour les non-administrateurs, l'accès classe-scopé aux horaires, aux cours, aux leçons, aux notes et aux listes utilisateurs. Le test génère un bulletin `ReportCard` depuis les cotations seedées.
- `scripts/verify-grade-promotion-flow.js` : historique de promotion lisible, 12 élèves/inscriptions et 22 notes présentes.
- Limite importante : le seed contient le modèle canonique `Bulletin`, tandis que les pages et l’API legacy lisent `ReportCard`. Aucun endpoint `/api/bulletins` ne les unifie; cette phase n’est donc pas terminée.

## Périmètre livré

### 1. Schéma Prisma (modèle RDC)

- **Nouveaux modèles** : `Period`, `Fee`, `Installment`, `AbsenceJustification`, `AuditLog`, `GradeSnapshot`, `Conversation` + `ConversationParticipant`, `Event`, `NotificationPreference` (+ `GradingDecisionRule` exploité côté métier).
- **Colonnes ajoutées** : `User.matricule` (MAT-YYYY-XXXX, index école), `User.parentCode`, `User.gender` (M/F), `User.isActive`/`active`, `Course.weeklyHours`, `Attendance.source` (MANUAL/QR/GPS) + `updatedAt`, `Payment.currency`/`receiptNumber` (unique)/`academicYear`, `SchoolClass.fees`/`titulaireId`, `Lesson.isPublished`, `Bulletin.status` (DRAFT→PENDING_TITULAIRE→VALIDATED_TITULAIRE→PENDING_ADMIN→VALIDATED_ADMIN→PUBLISHED) + appréciations + rang.
- **Optimistic locking** : `version Int @default(1)` sur User, SchoolClass, Course, Lesson, Grade, Homework, Submission, Attendance, Payment, Message, Notification, Ressource, Bulletin, ReportCard, CourseSchedule, AiConversation, Event ; `deletedAt` (soft delete) et `createdAt`/`updatedAt` sur les tables métier.
- **Migration** : `prisma/migrations/20261016120000_phase3_backend/migration.sql` — SQL **idempotent** (IF NOT EXISTS, DO $$ pour les FK) appliquable sans `migrate dev` (`npx prisma migrate deploy`).
- **Seed** : `prisma/seed.js` (`npm run db:seed`, configuré dans `package.json` sous `prisma.seed`). Démo « Institut La Grâce » (Kinshasa) : 1 école, année 2025-2026, 4 périodes, 3 classes (6ème A / 7ème B / 2ème Humanités A), 5 professeurs, 12 élèves (matricules MAT-2025-xxxx), 4 parents liés, 11 cours (coefficients + volume horaire), horaires, leçon publiée, 2 devoirs, 2 soumissions, 22 notes (P1), présences (QR + manuelle), 1 justification en attente, frais + tranches, 8 paiements (reçus REC-2026-xxxxxx, USD + CDF), 4 bulletins (tous les statuts), messages, événement, ressource, notifications, préférences, audit, règle de décision (seuil 50 %, rattrapage 45 %, max 2 échecs).

### 2. API — socle uniforme (`src/lib/api/`)

| Module | Rôle |
| --- | --- |
| `errors.ts` | `ApiError` (status + code), `handleApiError`, `assertFound` |
| `response.ts` | `ok/created/list/noContent`, `parseListParams` (page/limit ≤ 100/sort/order), `paginate` |
| `rbac.ts` | `requireAuth(req, roles?)`, `requireActiveAuth`, `assertSchool` (tenant), `assertSelfOrRole/Admin`, `assertSelfIfStudent`, `assertParentChild`, `assertStudentScope`, `assertTeacherCourse`, `assertTitulaireClass`, `childrenIds`, `scopedStudentIds` |
| `audit.ts` | `auditLog` non bloquant, `requestMeta`, `auditFromRequest` |
| `rate-limit.ts` | `rateLimit` mémoire, presets LOGIN/API/WRITE, `rateLimitResponse` (429 + `Retry-After`) |

Validation zod partagée client/serveur : `src/lib/validation/entities.ts` (user, classe, cours, planning, note, présence, justification, paiement, frais, tranche, leçon, devoir, soumission, message, bulletin + `BULLETIN_TRANSITIONS`, ressource, événement, notification, période, règles), `parseOrThrow`, types inférés exportés.

### 3. Middleware & sécurité

- `src/middleware.ts` : **toute route `/api/*` exige le cookie `gradeup_token`**, sauf liste blanche publique (auth, pawapay, geniuspay, health…) ; contrôle d'origine sur les méthodes mutantes.
- **Rate limiting** branché : login 5/15 min/IP (remplace l'ancien compteur local), forgot 5/15 min, register 10/h, sync push 30/min/user, IA 20/min.
- **Escalade corrigée** `PUT /api/users/[id]` : self-update = profil seul ; rôles/parentId/isTitulaire/matricule réservés ADMIN + audit `USER_ROLE_CHANGE`.
- Upload photo : MIME (jpeg/png/webp → 415) + 5 Mo max (413) ; compression client `src/lib/image-compress.ts` (`compressImage`, canvas, max 1600 px, JPEG 0.8).

### 4. Règles métier serveur (`src/lib/business/`)

- `rules.ts` : reçus uniques `REC-YYYY-NNNNNN` (verrou DB), matricules `MAT-YYYY-XXXX`, détection de conflits d'horaires (prof/salle/classe), seuils RDC configurables (`DEFAULT_RDC_THRESHOLDS` : réussite 50 %, rattrapage 45 %, max 2 échecs, table `GradingDecisionRule`).
- `average-service.ts` : moyennes pondérées par coefficient (/20), rang dense, mentions, décision ADMIS/RATTRAPAGE/ELIMINE, `assertGradeWritable` → **423** si période verrouillée.
- `bulletin-workflow.ts` : double validation (titulaire puis admin), ownership, `GradeSnapshot` à la publication, bulk.

### 5. Notifications

- `src/services/notifications/preferences.ts` (in-app/push/email/sms + types muets), `retry-queue.ts` (backoff 5 s×2^n, 5 essais), moteur câblé dans `notificationEngine.ts` (prefs + envoi direct/broadcast). Routes `GET/PUT /api/notification-preferences`.

### 6. Routes (141 fichiers, 253 endpoints — détail dans `docs/API.md`)

- **Nouvelles** : periods, fees (+installments), absence-justifications (+review), events, conversations, notification-preferences, audit-logs (ADMIN), grade-snapshots.
- **Duri­cies** : messagerie (senderId forcé session + ownership), ressources (PUBLIC/SCHOOL/CLASS/PRIVATE), IA (conversations/mémoire/historique), visio (tenant + créateur + membres), invite-code (ADMIN), schools/[id], db-health, notes (tenant + verrou + audit), paiements (tenant + reçu unique + audit), classes/cours/horaires/devoirs/soumissions (tenant + rôle), cahier de transmission, stats, présences.
- **Sync** : `push` (allowlist endpoints offline-safe + idempotence `SyncOperation` + rate limit), `pull` (delta par rôle : users, classes, courses, lessons, grades, homework, submissions, messages, notifications, schedules, resources, periods, fees, installments, events, absenceJustifications, gradeSnapshots).

### 7. Livrables transverses

- `docs/API.md` : référence complète (enveloppes, codes erreur, pagination, rôles par route, § sécurité connue).
- `docs/ENV.md` + `.env.example` complété : toutes les variables par catégorie (App, DB, Auth, Storage, Push, Paiements, Email, IA, Admin), JWT obligatoires en prod.
- `scripts/rbac-check.mjs` (`npm run test:rbac`) : 58 contrôles contre le serveur vivant (401/403 par rôle, ownership, isolation multi-écoles, bulletins publiés, workflow, notifications, sync push/pull et rate limit login 429).

## Checklist de fin de phase

- [x] Chaque table métier : `schoolId`, `createdAt`, `updatedAt`, `version`, `deletedAt` (où pertinent)
- [x] Endpoints CRUD + métier pour chaque entité, format d'enveloppe et d'erreur uniforme, pagination/filtres/tri
- [x] Authentification + contrôle de rôle sur **toutes** les routes `/api/*` (middleware + `requireAuth` ; 2 ⚠ résiduels documentés dans `docs/API.md` §7 : `debug/env` neutralisée 404, `config?inviteCode=` champs publics)
- [x] Ownership : parent→ses enfants, élève→ses données, prof→ses cours, titulaire→sa classe, admin→son école (+ isolation inter-écoles vérifiée par le script)
- [x] Validation zod partagée + types générés côté client
- [x] Verrouillage des notes, double validation des bulletins, moyennes/rang/mention/seuils RDC, reçus uniques, conflits d'horaires, matricules automatiques
- [x] AuditLog sur les actions sensibles (notes, paiements, rôles, bulletins, justifications…)
- [x] Notifications uniques (in-app + push) avec préférences et retry
- [x] Upload : limites MIME/taille, compression client, bucket Supabase documenté
- [x] Sync push/pull sur l'ensemble des entités hors ligne
- [x] Rate limiting, erreurs uniformes, variables d'environnement documentées
- [x] Gates : `tsc 0`, `lint 0`, `build 0`, dev relancé (`/api/health` → 200)
- [x] Seed permettant de tester les 4 rôles avec données liées (`npm run db:seed`)
- [x] `npm run db:seed` + `npm run test:rbac` exécutés sur une base PostgreSQL locale de développement isolée ; 79/79 contrôles passent sur le serveur standalone construit avec `.env.local`.
- [ ] Validation à répéter contre la base distante/production autorisée, après déploiement des migrations.
- [ ] Unifier les modèles `Bulletin` et `ReportCard`, ajouter `/api/bulletins` ou remplacer les consommateurs, puis connecter le workflow canonique et le PDF officiel.

## Comptes de démonstration (seed)

| Rôle | Identifiant | Mot de passe |
| --- | --- | --- |
| ADMIN | `admin@gradeup.cd` | `Demo1234!` |
| TEACHER (titulaire 7ème B) | `prof.kalala@gradeup.cd` | `Demo1234!` |
| TEACHER (titulaire 6ème A) | `prof.nsimba@gradeup.cd` | `Demo1234!` |
| STUDENT (6ème A) | `gracia.mputu@student.cd` | `Demo1234!` |
| PARENT (de Gracia) | `parent.mputu@gradeup.cd` | `Demo1234!` |
| Code école | `ECOLE-DEMO26` | — |

## Commandes

```bash
npx prisma migrate deploy   # applique la migration idempotente
npm run db:seed             # démo RDC (idempotent, cascade)
npm run dev                 # serveur
npm run test:rbac           # tests d'autorisation (serveur + base requis)
```

## Suites techniques

- Brancher le rate limiting sur Redis/Upstash en multi-instances (l'implémentation mémoire est mono-instance).
- Remplacer les 2 routes ⚠ résiduelles (`debug/env` déjà neutralisée 404 ; `config?inviteCode=` à restreindre à une vue publique minimale si nécessaire).
- Exécuter `npm run db:seed` + `npm run test:rbac` sur l'environnement avec base joignable lors du prochain déploiement.
