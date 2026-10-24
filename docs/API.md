# GradeUp — Référence API

Référence complète des routes `src/app/api/**/route.ts` (App Router, Next.js).
Toutes les réponses sont en JSON UTF-8 ; les messages d'erreur sont en français sauf mention contraire (routes héritées).

---

## 1. Format d'enveloppe

| Succès | Forme |
| --- | --- |
| Singleton | `{ <entité>: data }` — ex. `{ grade }`, `{ user }`, `{ school }` |
| Création | identique, statut `201` — ex. `{ lesson }` (201) |
| Liste via `list()` | `{ <entité>s: [...], pagination: { page, pageSize, total, totalPages } }` |
| Brute / legacy | tableaux ou objets plats non enveloppés (ex. `{ grades: enriched }`, `{ users }`, tableau nu de `deliberation`) |
| `204` | corps vide (`noContent()`) |

**Erreurs** — forme uniforme produite par `handleApiError` (`src/lib/api/errors.ts`) :

```json
{ "error": "Message lisible.", "code": "CODE_STATUT" }
```

| Statut | `code` | Signification |
| --- | --- | --- |
| 400 | `BAD_REQUEST` / `MISSING_PARAM` / `P2xxx` | Requête invalide, paramètre manquant, violation Prisma |
| 401 | `UNAUTHENTICATED` | Session absente ou JWT invalide (middleware ou `requireAuth`) |
| 403 | `FORBIDDEN` / `ROLE_FORBIDDEN` / `TENANT_FORBIDDEN` / `OWNERSHIP_FORBIDDEN` / `CSRF_ORIGIN` / `ACCOUNT_DISABLED` | Rôle, tenant (école), propriété, origine non same-origin, compte désactivé |
| 404 | `NOT_FOUND` / `P2025` | Ressource introuvable (`assertFound`) |
| 409 | `CONFLICT` / `P2002` | Doublon (unicité Prisma) ou état concurrent |
| 413 | `PAYLOAD_TOO_LARGE` | Fichier trop volumineux (uploads) |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Type MIME refusé (uploads) |
| 422 | `UNPROCESSABLE` | Corps/format non traitable (validation Zod) |
| 423 | `LOCKED` / `PERIOD_LOCKED` | **Verrou de période de note** via `assertGradeWritable` (`src/lib/business/average-service.ts`) : « Période clôturée : les notes ne sont plus modifiables » — aussi levé par `assertYearOpen` / `assertGradePeriodOpen` |
| 429 | `RATE_LIMITED` | Rate limit dépassé ; corps : `{ error, code: 'RATE_LIMITED', retryAfter: <secondes> }` + en-tête `Retry-After` |
| 500 | `INTERNAL_ERROR` | Erreur serveur (message masqué en production) |

---

## 2. Authentification

- **Cookie `gradeup_token`** : JWT signé, `httpOnly`, envoyé par le serveur à login/refresh, vérifié par `authenticateRequest` / `verifyAccessToken` (`src/lib/auth/*`).
- **Middleware** `src/middleware.ts` (matcher `/api/:path*`) :
  1. exige la présence du cookie `gradeup_token` sur **toutes** les routes `/api/*` sauf liste blanche ;
  2. refuse les écritures (POST/PUT/PATCH/DELETE) dont l'en-tête `Origin` diffère du `Host` → `403 CSRF_ORIGIN`.
  La vérification cryptographique du JWT et le contrôle de rôle/tenant restent dans les routes (`requireAuth`).

**Liste blanche publique** (lue dans `src/middleware.ts`) :

| Type | Chemins |
| --- | --- |
| Exacts | `/api`, `/api/health`, `/api/reviews`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/register`, `/api/auth/refresh`, `/api/auth/forgot`, `/api/auth/verify-otp`, `/api/auth/reset`, `/api/auth/me` |
| Préfixes | `/api/auth/` (toute la famille), `/api/payments/pawapay` (callbacks passerelle), `/api/payments/geniuspay` (callbacks) |

---

## 3. Rate limiting

Implémentation en mémoire : `src/lib/api/rate-limit.ts` (`rateLimit(clé, limite, fenêtre)` → 429 `RATE_LIMITED` + `retryAfter`).

| Cible | Clé | Limite | Fenêtre | Où |
| --- | --- | --- | --- | --- |
| Login | `login:<IP>` | 5 | 15 min | `POST /api/auth/login` (`LOGIN_RATE_LIMIT`) |
| Mot de passe oublié | `forgot:<IP>` | 5 | 15 min | `POST /api/auth/forgot` |
| Inscription | `register:<IP>` | 10 | 1 h | `POST /api/auth/register` |
| Sync push | `sync-push:<userId>` | 30 | 1 min | `POST /api/sync/push` (`WRITE_RATE_LIMIT`) |
| IA (chat Gradie) | `ai:<userId ou IP>` | 20 | 1 min | `POST /api/ai` |
| Validation code parent | Map locale par IP | 10 | 1 min | `GET /api/parent-link/validate` |
| Général | `API_RATE_LIMIT` défini (120/min/IP) mais non branché sur les routes | — | — | `src/lib/api/rate-limit.ts` |

---

## 4. RBAC (4 rôles)

`src/lib/api/rbac.ts` — `Role = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT'`.

| Rôle | Périmètre typique |
| --- | --- |
| `ADMIN` | Son école uniquement (`assertSchool`, `schoolId: auth.schoolId`) — création/modération globales |
| `TEACHER` | Ses cours et ses classes titulaires (`assertTeacherCourse`, `assertTitulaireClass`, `teacherCourseIds`) |
| `STUDENT` | Ses seules données (`assertSelfIfStudent`, `scopedStudentIds`) |
| `PARENT` | Ses enfants (`assertParentChild`, `childrenIds`, `assertStudentScope`) |

Primitives : `requireAuth(req, roles?)` (401 sans session, 403 rôle) · `requireActiveAuth` (+ compte actif, 403 `ACCOUNT_DISABLED`) · `assertSchool` · `assertSelfOrRole` · `assertSelfOrAdmin` · `assertStudentScope` · `assertTeacherCourse` · `assertTitulaireClass` · `scopedStudentIds` · `childrenIds` · `teacherCourseIds` · `titulaireClassIds`.

Deux générations coexistent :
- **nouveau pattern** — `requireAuth(request, ['ADMIN'])` ;
- **ancien pattern** — `authenticateRequest(request)` puis tests `auth.role !== 'ADMIN'` inline (même garantie, code dupliqué).

---

## 5. Pagination, tri et filtres

`parseListParams(searchParams, defaultOrder)` (`src/lib/api/response.ts`) :

- `?page=` (≥ 1, défaut 1)
- `?pageSize=` (1–**100** max, défaut 50) — borne via `MAX_PAGE_SIZE = 100`
- `?orderBy=champ:asc|desc[,champ2:dir[,champ3:dir]]` — 3 champs max, champs identifiants `[a-zA-Z][a-zA-Z0-9_]*` uniquement (anti injection de chemin relation) ; défaut `createdAt:desc`

Le paramètre `limit/sort/order` n'est **pas** utilisé : les listes lisent `page`, `pageSize`, `orderBy`. Réponse : `{ <entité>s, pagination }` via `list()` + `paginate()`.

---

## 6. Routes par domaine

Légende rôles : **Public** (liste blanche middleware) · **Toute session** (JWT valide, tenant limité dans la route) · rôles nommés = `requireAuth(req, [..])` ou test équivalent. « ⚠ » = voir §7.

### 6.1 Racine & diagnostics

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api` | Public | Hello world de test | `{ message }` |
| `GET /api/health` | Public | Santé applicative + temps de réponse DB (`SELECT 1`) | `{ status, responseTimeMs, databaseTimeMs }` (503 si indispo) |
| `GET /api/reviews` | Public | Avis publics approuvés (cache CDN 5 min) | `{ reviews }` |
| `POST /api/reviews` | Public | Dépôt d'avis (anti-doublon `visitorId`, 1/jour) | `{ review }` |
| `GET /api/debug/env` | ⚠ NON SÉCURISÉE (legacy) — route **neutralisée** (répond toujours 404) | Ancien diagnostic d'env, désactivée | `{ error, code }` 404 |
| `POST /api/debug/env` | ⚠ NON SÉCURISÉE (legacy) — neutralisée (404) | Idem, POST | `{ error, code }` 404 |

### 6.2 Auth & session (publiques par conception)

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `POST /api/auth/login` | Public (5/15 min/IP) | Connexion (admin par email ; autres par code école + identifiant) → pose le cookie | `{ user, ok }` |
| `POST /api/auth/register` | Public (10/h/IP) | Inscription élève/enseignant/parent/admin d'école | `{ user, ... }` 201 |
| `POST /api/auth/forgot` | Public (5/15 min/IP) | Demande OTP de réinitialisation par email | `{ message }` |
| `POST /api/auth/verify-otp` | Public | Vérifie l'OTP et ouvre la session de réinitialisation | `{ ok, userId }` |
| `POST /api/auth/reset` | Public | Nouveau mot de passe avec OTP | `{ ... }` |
| `POST /api/auth/refresh` | Public | Rafraîchit le JWT (rotation du cookie) | `{ user, ok }` |
| `POST /api/auth/logout` | Public | Déconnexion (efface le cookie) | `{ ok: true }` |
| `GET /api/auth/me` | Public | Profil courant ou `{ user: null }` | `{ user }` |

### 6.3 Écoles & utilisateurs

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/users` | ADMIN (école), TEACHER (élèves de ses cours), STUDENT (son profil), PARENT (ses enfants), CAISSIER (élèves) | Liste bornée par rôle; les rôles non-admin ne reçoivent ni mot de passe ni code parent | `{ users }` |
| `POST /api/users` | ADMIN | Création d'un compte (validation Zod, carte gratuite) | `{ user }` 201 |
| `PATCH /api/users` | ADMIN | Active/désactive ou modifie un compte de son école | `{ user }` |
| `DELETE /api/users` | ADMIN | Suppression (refusée si liens parent/enfant) | `{ success }` |
| `GET /api/users/[id]` | Self, ADMIN, PARENT (enfant) | Profil détaillé | `{ user }` |
| `PUT /api/users/[id]` | Self (profil) ou ADMIN (champs privilégiés : rôle, email, mot de passe, titulaire) | Mise à jour de profil avec audit de changement de rôle | `{ user }` |
| `DELETE /api/users/[id]` | ADMIN | Suppression définitive d'un compte de son école | `{ message }` |
| `GET /api/schools/[id]` | Toute session (session optionnelle : sinon vue publique restreinte) | Fiche école (complet si même école) | `{ ...school }` / vue publique |
| `PUT /api/schools/[id]` | ADMIN (son école, `assertSchool`) | Mise à jour des champs autorisés de l'école | `{ ...school }` |
| `GET /api/config` | Lookup `inviteCode` sans test de rôle dans la route (cookie exigé par middleware) ; `schoolId` → session active | Configuration de l'école | `{ school }` / `{ config, school }` |
| `PUT /api/config` | ADMIN | Mise à jour de la configuration de son école | `{ config, school }` |
| `POST /api/invite-code` | ADMIN | (Re)génère le code d'invitation de son école | `{ inviteCode }` |
| `POST /api/ecole/logo` | ADMIN | Upload du logo école (48 Mo, images) | `{ logoUrl, provider }` |
| `DELETE /api/ecole/logo` | ADMIN | Supprime le logo école | `{ success }` |
| `GET /api/school-years` | Toute session | Années scolaires de l'école (tenant = session) | `{ years }` |
| `POST /api/parent-code` | ADMIN du même établissement | Génère ou régénère un code pour un élève actif de son école ; codes aléatoires cryptographiques et unicité retentée | `{ parentCode }` |
| `POST /api/parent-link` | PARENT | Lien parent↔enfant via code parent | `{ success, student }` |
| `GET /api/parent-link/validate` | PARENT (10/min/IP) | Valide un code parent, renvoie l'élève | `{ valid, studentName?, schoolName? }` |
| `GET /api/parent/children` | PARENT | Liste des enfants rattachés | `{ children }` |
| `DELETE /api/user/data` | Self ou ADMIN (son école) | Purge des conversations/données IA de l'utilisateur | `{ success, message }` |

### 6.4 Administration & audit

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/stats` | Toute session active | Compteurs globaux de l'école (élèves, profs, paiements…) | `{ totalStudents, totalTeachers, ..., stats }` |
| `GET /api/stats/progression` | ADMIN, TEACHER | Progression des notes par composante | `{ progression, components, raw }` |
| `GET /api/audit-logs` | ADMIN | Journal d'audit de l'école (paginé) | `{ auditLogs, pagination }` |
| `GET /api/admin/db-health` | ADMIN + header `x-admin-secret` (= `ADMIN_OPS_KEY`/`JWT_SECRET`) | Diagnostic abonnements de toutes les écoles | `{ totalSchools, schools, expiredByDateCount }` |
| `POST /api/admin/db-health` | ADMIN + `x-admin-secret` | Réactive les abonnements non suspendus (+2 ans) | `{ count, ... }` |
| `GET /api/admin/fix-subscription` | ADMIN | État des abonnements de toutes les écoles | `{ schools }` |
| `POST /api/admin/fix-subscription` | ADMIN (son école) | Remet l'abonnement à `active` (+2 ans) | `{ success, school }` |

### 6.5 Classes & inscriptions

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/classes` | Toute session active (portée par rôle) | Classes de l'école | `{ classes }` |
| `POST /api/classes` | ADMIN | Création d'une classe (unicité du nom) | `{ class }` 201 |
| `GET /api/classes/[id]` | Toute session (école) | Détail d'une classe | `{ class }` |
| `PUT /api/classes/[id]` | ADMIN | Modification d'une classe | `{ class }` |
| `DELETE /api/classes/[id]` | ADMIN | Suppression d'une classe | `{ message }` |
| `GET /api/passages` | Toute session (élève→lui, parent→enfants) | Historique des passages/redoublements | `{ passages }` |
| `POST /api/passages` | ADMIN | Enregistre un passage vers une classe cible | `{ passage }` 201 |
| `GET /api/periods` | Toute session | Périodes (trimestres) de l'école | `{ periods }` |
| `POST /api/periods` | ADMIN, TEACHER | Création d'une période | `{ period }` 201 |
| `GET /api/periods/[id]` | Toute session | Détail d'une période | `{ period }` |
| `PUT /api/periods/[id]` | ADMIN | Modification d'une période | `{ period }` |
| `DELETE /api/periods/[id]` | ADMIN | Suppression d'une période | `{ success }` |

### 6.6 Cours & horaires

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/courses` | ADMIN (école), TEACHER (ses cours), STUDENT (classes inscrites), PARENT (classes de ses enfants) | Cours bornés par école, rôle et inscriptions; refuse un filtre `teacherId`/`classId` hors portée | `{ courses }` |
| `POST /api/courses` | ADMIN | Création d'un cours | `{ course }` 201 |
| `PUT /api/courses` | ADMIN | Mise à jour d'un cours par `id` | `{ course }` |
| `GET /api/courses/[id]` | Toute session (portée par rôle) | Détail d'un cours | `{ course }` |
| `PUT /api/courses/[id]` | ADMIN ou professeur du cours | Modification d'un cours | `{ course }` |
| `DELETE /api/courses/[id]` | ADMIN ou professeur du cours | Suppression d'un cours | `{ message }` |
| `GET /api/courses-with-points` | ADMIN | Cours avec points/système de cotation | `{ courses }` |
| `POST /api/courses-with-points` | ADMIN | Création d'un cours coté | `{ course }` 201 |
| `PUT /api/courses-with-points/[id]` | ADMIN | Modification | `{ course }` |
| `DELETE /api/courses-with-points/[id]` | ADMIN | Suppression | `{ success }` |
| `GET /api/schedules` | ADMIN (école), TEACHER (classes de ses cours), STUDENT (classes inscrites), PARENT (classes de ses enfants) | Grille horaire bornée aux classes autorisées; filtre `classId` validé côté serveur | `schedules[]` |
| `POST /api/schedules` | ADMIN | Ajout d'un créneau de cours | `{ schedule }` 201 |
| `PUT /api/schedules` | ADMIN | Modification d'un créneau | `{ schedule }` |
| `DELETE /api/schedules` | ADMIN | Suppression d'un créneau | `{ success }` |
| `GET /api/schedules/timeslots` | Toute session (école) | Créneaux horaires de la journée | `{ timeSlots }` |
| `PUT /api/schedules/timeslots` | ADMIN | Mise à jour des créneaux | `{ timeSlots }` |
| `POST /api/schedules/duplicate` | ADMIN | Duplique l'horaire d'une classe vers une autre | `{ ... }` |
| `GET /api/conferences` | Toute session (école) | Liste des conférences | `{ conferences }` |
| `POST /api/conferences` | ADMIN | Création d'une conférence | `{ conference }` 201 |
| `DELETE /api/conferences` | ADMIN | Suppression d'une conférence | `{ success }` |

### 6.7 Notes & évaluations (y compris cahier)

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/grades` | ADMIN (école), TEACHER (ses cours uniquement), STUDENT (lui), PARENT (ses enfants) | Notes filtrées (`courseId`, `studentId`, `trimester`…); refuse le cours et `teacherId` usurpés par un professeur | `{ grades }` |
| `POST /api/grades` | Professeur du cours / ADMIN (clé `operationId` idempotente) | Saisie d'une note (verrou période → 423) | `{ grade }` 201 |
| `GET /api/grades/[id]` | Self (élève) / parent (enfant) / staff école | Détail d'une note | `{ grade }` |
| `PUT /api/grades/[id]` | Professeur du cours / ADMIN | Correction d'une note (period lock 423, sinon demande de modification) | `{ grade }` |
| `PATCH /api/grades/[id]` | Professeur de la note / ADMIN (validation) | Changement de statut d'une note (workflow de validation) | `{ grade }` |
| `DELETE /api/grades/[id]` | Professeur du cours / ADMIN (professeur bloqué sans validation) | Suppression d'une note (423 si période clôturée) | `{ message }` |
| `GET /api/grades/[id]/history` | ADMIN, professeur du cours | Historique des versions d'une note | `{ history }` |
| `POST /api/grades/sync-report` | ADMIN / TEACHER (ses classes) | Resynchronisation forcée des bulletins d'une classe | `{ message, synced, failed }` |
| `GET /api/grades/sync-report` | Toute session (portée par rôle) | Bulletins synchronisés pour un élève/trimestre | `{ reportCards }` |
| `GET /api/grade-snapshots` | STUDENT, PARENT (porté) | Instantanés des notes (suivi hors ligne) | `{ gradeSnapshots }` |
| `GET /api/coefficients` | Toute session (école) | Coefficients par classe/cours | `{ coefficients }` |
| `POST /api/coefficients` | ADMIN | Définition d'un coefficient | `{ coefficient }` 201 |
| `GET /api/grading-rules` | Session active (école) | Règles de délibération (ou défaut) | `{ rules, isDefault }` |
| `POST /api/grading-rules` | ADMIN | Enregistre les règles de délibération | `{ success, rule }` |
| `GET /api/subject-rules` | Session active (école) | Règles par matière (max, coefficient) | `{ rules }` |
| `POST /api/subject-rules` | ADMIN | Création/mise à jour en lot de règles matière | `{ success, count, rules }` |
| `DELETE /api/subject-rules` | ADMIN | Suppression d'une règle matière | `{ success }` |
| `GET /api/note-modifications` | Toute session (élève→ses demandes, prof→ses cours) | Demandes de modification de note | `{ noteModifications }` |
| `POST /api/note-modifications` | STUDENT (ses notes), TEACHER (ses cours) | Demande de modification (409 si déjà en attente) | `{ noteModification }` 201 |
| `PATCH /api/note-modifications/[id]` | ADMIN | Approuve/ rejette une demande | `{ noteModification }` |
| `GET /api/academic-closures` | Toute session (école) | Clôtures académiques d'une année | `{ closures }` |
| `POST /api/academic-closures` | ADMIN, TEACHER | Ferme un périmètre (jour/semaine/…/année) | `{ closure }` |
| `GET /api/cahier/evaluations` | Professeur du cours / titulaire / ADMIN | Évaluations du cahier de textes | `{ students, evaluations }` |
| `POST /api/cahier/evaluations` | Professeur du cours / ADMIN | Création d'une évaluation | `{ evaluation }` 201 |
| `PUT /api/cahier/evaluations` | Professeur du cours (cotation ; ADMIN si existant) | Saisie/ modification des notes d'une évaluation | `{ success }` |
| `PATCH /api/cahier/evaluations` | Professeur du cours | Modification des métadonnées (maxScore…) | `{ evaluation }` |
| `DELETE /api/cahier/evaluations` | ADMIN de l'école | Suppression d'une évaluation | `{ success }` |
| `POST /api/cahier/sync-to-report` | TEACHER titulaire de la classe / ADMIN | Synchronise le cahier vers les bulletins | `{ message, synced }` |
| `POST /api/cahier/transmissions/send` | ADMIN, TEACHER | Envoie des évaluations au titulaire | `{ success, sent, errors }` |
| `PATCH /api/cahier/transmissions/receive` | Titulaire concerné / ADMIN | Approuve ou rejette une transmission | `{ success }` |
| `GET /api/cahier/transmissions/sent` | ADMIN, TEACHER | Transmissions envoyées par un enseignant | `{ transmissions }` |
| `GET /api/cahier/transmissions/received` | ADMIN, TEACHER | Transmissions reçues par un titulaire | `{ transmissions }` |
| `GET /api/cahier/transmissions/dashboard` | ADMIN, TEACHER | Tableau de bord des transmissions | `{ classes, summary }` |
| `GET /api/cahier/transmissions/assembled` | ADMIN, TEACHER | Cahier assemblé (élèves + cours consolidés) | `{ students, courses }` |

### 6.8 Bulletins & délibérations

Le flux canonique Phase 4 vit dans `Bulletin` et n'est pas interchangeable avec l'ancien `ReportCard`. Les écrans élève/parent utilisent maintenant ce flux et n'exposent que `PUBLISHED`.

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/bulletins` | ADMIN, TEACHER titulaire, STUDENT, PARENT | Liste école-scopée; élèves/parents ne voient que leurs bulletins publiés | `{ bulletins }` |
| `POST /api/bulletins/generate` | ADMIN, TEACHER titulaire | Calcule les brouillons et rangs depuis les notes réelles; refuse les élèves sans notes | `{ generated, unchanged }` |
| `PUT /api/bulletins/[id]/validate-titulaire` | ADMIN, TEACHER titulaire | Valide les notes et appréciations de classe | `{ bulletin }` |
| `PUT /api/bulletins/[id]/validate-admin` | ADMIN | Appréciation de la direction et validation administrative | `{ bulletin }` |
| `PUT /api/bulletins/[id]/publish` | ADMIN | Publication en ligne et notifications élève/parent | `{ bulletin }` |
| `GET /api/bulletins/[id]/pdf` | ADMIN, TEACHER titulaire, propriétaire élève/parent | PDF officiel; élève/parent seulement après publication | `application/pdf` |

L'ancien `ReportCard` reste présent pour compatibilité et les usages qui n'ont pas encore migré. La consolidation des anciennes données et la suppression de l'ancien workflow restent nécessaires avant de déclarer l'unification terminée.

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/report-cards` | ADMIN, TEACHER (ses classes), STUDENT/PARENT (publiés seulement) | Bulletins du même établissement ; les rôles non autorisés sont refusés | `{ reportCards }` |
| `POST /api/report-cards` | ADMIN, TEACHER (ses classes) | Génération d'un bulletin (cotation réelle requise) | `{ reportCard, synchronized }` |
| `PUT /api/report-cards` | ADMIN, TEACHER titulaire de la classe | Transitions strictes : `draft/auto_draft → pending_admin → validated → published` ; mise à jour conditionnelle pour refuser les courses concurrentes | `{ reportCard }` |
| `DELETE /api/report-cards` | ADMIN | Suppression d'un bulletin | `{ success }` |
| `GET /api/report-cards/archive` | ADMIN, TEACHER | Bulletins archivés | `{ reportCards }` |
| `POST /api/report-cards/counter` | ADMIN, TEACHER | Compteur de générations par classe/trimestre | `{ canGenerate, counter }` |
| `GET /api/report-cards/stats` | ADMIN, TEACHER | Statistiques de génération globales | `{ totalGenerated, globalGenerated, remaining, ... }` |
| `GET /api/deliberation` | Session active (école) | Décisions de délibération | tableau nu de décisions |
| `POST /api/deliberation` | ADMIN | Validation d'une décision (passage, redoublement…) | `{ decision }` |
| `GET /api/end-of-year` | ADMIN, TEACHER (ses classes) | Analyse de fin d'année (classes, récap, diagnostics) | `{ classes, recap, diagnostics }` |
| `POST /api/end-of-year` | ADMIN | Verrouillage d'année, promotion de classes, transition | `{ success, message }` |

### 6.9 Présences & justifications

| `POST /api/presence/scan` | ADMIN | Pointage par code QR (matricule, identifiant ou QR `/carte/...`); doublon journalier refusé | `{ user, presence }` 201; doublon 409 |

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/attendance` | Toute session (parent→ses enfants, élève→lui, prof→ses cours) | Registre des présences/absences | `{ attendance }` |
| `POST /api/attendance` | TEACHER / ADMIN | Saisie d'une présence (année ouverte → 423) | `{ attendance }` 201 |
| `POST /api/attendance/batch` | TEACHER / ADMIN | Saisie en lot (clé d'opération idempotente) | `{ ... }` |
| `GET /api/attendance/[id]` | TEACHER / ADMIN (école) | Détail d'un relevé | `{ attendance }` |
| `PUT /api/attendance/[id]` | TEACHER / ADMIN | Modification d'un relevé | `{ attendance }` |
| `DELETE /api/attendance/[id]` | TEACHER / ADMIN | Suppression d'un relevé | `{ message }` |
| `GET /api/absence-justifications` | Toute session (staff→tout, parent/élève→les siens) | Demandes de justificatif d'absence | `{ absenceJustifications }` |
| `POST /api/absence-justifications` | PARENT, STUDENT, ADMIN | Dépôt d'un justificatif | `{ absenceJustification }` 201 |
| `GET /api/absence-justifications/[id]` | Toute session (staff ou demandeur) | Détail d'une justification | `{ absenceJustification }` |
| `PATCH /api/absence-justifications/[id]/review` | ADMIN, TEACHER | Approuve/ rejette le justificatif | `{ absenceJustification }` |
| `POST /api/presence` | Toute session | Heartbeat de présence en ligne (soi-même) | `{ success }` |
| `GET /api/presence` | Toute session (même école) | Présence en ligne de plusieurs utilisateurs | `{ presences }` |
| `GET /api/presence/aujourdhui` | Toute session (parent→ses enfants) | Présences du jour | `{ presence }` ou `{ presences, stats }` |
| `GET /api/presence/historique` | Toute session (porté) | Historique + série temporelle | `{ presences, chartData, total }` |
| `PUT /api/presence/historique` | ADMIN | Validation des justificatifs de présence | `{ presence }` |
| `POST /api/presence/marquer` | TEACHER (sa propre présence, contrôle géo) | Marque l'arrivée du jour | `{ success, presence, statut, message }` |

### 6.10 Devoirs & soumissions

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/homework` | Toute session (porté : élève→ses classes, parent→enfants, prof→ses cours) | Devoirs | `{ homework }` |
| `POST /api/homework` | TEACHER, ADMIN | Création d'un devoir (clé idempotente) | `{ homework }` 201 |
| `GET /api/homework/[id]` | Toute session (porté) | Détail d'un devoir | `{ homework }` |
| `PUT /api/homework/[id]` | ADMIN ou professeur propriétaire | Modification d'un devoir | `{ homework }` |
| `DELETE /api/homework/[id]` | ADMIN ou professeur propriétaire | Suppression d'un devoir | `{ message }` |
| `GET /api/submissions` | Toute session (prof→soumissions du devoir, élève→les siennes) | Soumissions | `{ submissions }` |
| `POST /api/submissions` | STUDENT (ses devoirs) | Dépôt d'une soumission | `{ submission }` 201 |
| `PUT /api/submissions/[id]` | STUDENT (sa soumission) / TEACHER (correction) / ADMIN | Mise à jour ou correction | `{ submission }` |

### 6.11 Messages & conversations

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/messages` | Toute session (interlocuteurs de l'utilisateur ; ADMIN peut cibler un autre `userId`) | Liste des interlocuteurs + dernier message + non lus | tableau brut de conversations |
| `POST /api/messages` | Toute session (`senderId` forcé à la session) | Envoi d'un message (max 5000 car.) | message brut 201 |
| `GET /api/messages/[id]` | Participant (expéditeur/destinataire) | Détail d'un message | `{ message }` |
| `PATCH /api/messages/[id]` | Expéditeur | Édition d'un message | `{ message }` |
| `DELETE /api/messages/[id]` | Expéditeur | Suppression d'un message | `{ success }` |
| `GET /api/messages/conversation` | Participant (ADMIN autorisé) | Fil complet entre deux utilisateurs (marquage lu) | tableau brut de messages |
| `POST /api/messages/reply` | Participant du message original | Réponse à un message | `{ message }` 201 |
| `GET /api/messages/search` | Toute session (ADMIN peut chercher pour un autre) | Recherche plein texte dans ses messages | `{ messages }` |
| `GET /api/messages/unread-count` | Toute session | Compteur de messages non lus | `{ unreadMessages }` |
| `GET /api/messages/reactions` | Toute session | Réactions groupées d'un message | `{ reactions }` |
| `POST /api/messages/reactions` | Participant | Ajout/ retrait d'une réaction | `{ action, emoji }` |
| `DELETE /api/messages/reactions` | Participant | Retrait d'une réaction | `{ success }` |
| `GET /api/conversations` | Participant | Conversations de groupe de l'utilisateur | `{ conversations }` |
| `POST /api/conversations` | Toute session (participants même école) | Création/réutilisation d'une conversation de groupe | `{ conversation }` |
| `GET /api/conversations/[id]` | Participant | Détail d'une conversation | `{ conversation }` |
| `PATCH /api/conversations/[id]` | OWNER ou ADMIN | Ajout de participants | `{ conversation }` |
| `DELETE /api/conversations/[id]` | OWNER ou ADMIN | Suppression de la conversation | `{ success }` |

### 6.12 Ressources & leçons

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/lessons` | ADMIN (école), TEACHER (ses cours), STUDENT (classes inscrites), PARENT (classes de ses enfants) | Leçons limitées par école, rôle et classes accessibles | `{ lessons }` |
| `POST /api/lessons` | TEACHER, ADMIN | Création d'une leçon (prof limité à ses cours, tenant forcé) | `{ lesson }` 201 |
| `GET /api/lessons/[id]` | Toute session (porté par rôle) | Détail d'une leçon | `{ lesson }` |
| `PUT /api/lessons/[id]` | ADMIN | Modification d'une leçon | `{ lesson }` |
| `DELETE /api/lessons/[id]` | ADMIN | Suppression d'une leçon | `{ message }` |
| `GET /api/resources` | Toute session (école) | Bibliothèque de ressources + facettes de filtre | `{ resources, facets }` |
| `POST /api/resources` | ADMIN, TEACHER | Création d'une ressource | `{ resource }` 201 |
| `GET /api/resources/[id]` | ADMIN, TEACHER | Détail d'une ressource | `{ resource }` |
| `PATCH /api/resources/[id]` | Auteur (enseignant) ou ADMIN | Modification d'une ressource | `{ resource }` |
| `DELETE /api/resources/[id]` | Auteur ou ADMIN | Suppression d'une ressource | `{ success }` |
| `POST /api/resources/[id]/favorite` | Toute session | Ajoute aux favoris | `{ success }` |
| `DELETE /api/resources/[id]/favorite` | Toute session | Retire des favoris | `{ success }` |
| `POST /api/resources/upload` | ADMIN, TEACHER, STUDENT, PARENT | Upload de fichier (25 Mo, types contrôlés) | `{ url }` |
| `GET /api/epst/curriculum` | Toute session | Programme EPST par niveau et matière | `{ ...curriculum }` |
| `GET /api/documents` | Toute session (école) | Documents de la bibliothèque enseignante | `{ documents }` |
| `POST /api/documents` | TEACHER (et ADMIN) | Ajout d'un document | `{ document }` 201 |
| `PUT /api/documents` | Auteur (professeur) ou ADMIN | Modification d'un document | `{ document }` |
| `DELETE /api/documents` | Auteur ou ADMIN | Suppression d'un document | `{ success }` |

### 6.13 Événements & calendrier

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/events` | Toute session (élève/parent portés) | Événements de l'école | `{ events }` |
| `POST /api/events` | ADMIN, TEACHER | Création d'un événement | `{ event }` 201 |
| `GET /api/events/[id]` | Toute session | Détail d'un événement | `{ event }` |
| `PUT /api/events/[id]` | ADMIN, TEACHER | Modification d'un événement | `{ event }` |
| `DELETE /api/events/[id]` | ADMIN, TEACHER | Suppression d'un événement | `{ event }` |
| `GET /api/calendar` | Toute session (école) | Calendrier scolaire (cycle/mois/période) | `{ calendar }` |
| `POST /api/calendar` | ADMIN | Upsert d'une mapping mois → période | `{ calendar }` |
| `DELETE /api/calendar` | ADMIN | Suppression d'un calendrier | `{ success }` |
| `POST /api/calendar/seed` | ADMIN | Seed du calendrier par défaut de l'année | `{ seeded, schoolYearId }` |

### 6.14 Notifications & préférences

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/notifications` | Toute session (filtrage par rôle, school forcée depuis le JWT) | Notifications personnelles, ciblées à un rôle, une classe, un utilisateur précis ou toute l'école | `{ notifications }` (ou liste pour les clients rôle ciblé) |
| `POST /api/notifications` | ADMIN uniquement | Création validée Zod, destinataire confirmé dans la même école, auditée; diffusion in-app/realtime | `{ notification }` 201 |
| `GET /api/notifications/[id]` | Destinataire / rôle ciblé / ADMIN | Détail d'une notification | `{ notification }` |
| `PUT /api/notifications/[id]` | Destinataire (marquage lu) ; ADMIN (contenu) | Mise à jour du statut ou du contenu | `{ notification }` |
| `DELETE /api/notifications/[id]` | Destinataire ou ADMIN | Suppression | `{ message }` |
| `GET /api/notifications/stream` | Toute session (JWT vérifié manuellement via cookie + query `userId`/`role`/`schoolId` cohérents) | Flux SSE de notifications temps réel (portée par rôle/écoles) | `text/event-stream` |
| `POST /api/notifications/push/subscribe` | Self ou ADMIN | Abonnement Web Push | `{ success, subscription }` |
| `POST /api/notifications/welcome` | Toute session | Notification de bienvenue (une seule fois) | `{ success, alreadySent }` |
| `POST /api/notifications/broadcast-update` | ADMIN | Diffuse une mise à jour applicative à l'école | `{ success, message }` |
| `GET /api/notifications/broadcast-update` | ADMIN | État de la dernière diffusion | `{ ... }` |
| `GET /api/notification-preferences` | Toute session | Préférences de notification | `{ preference }` |
| `PUT /api/notification-preferences` | Toute session | Mise à jour des préférences | `{ preference }` |

### 6.15 IA (assistant Gradie)

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `POST /api/ai` | Toute session (contexte et outils adaptés au rôle ; 20/min) | Conversation avec l'assistant IA | réponse streamée / `{ ... }` |
| `POST /api/ai/actions` | ADMIN | Actions IA en lot sur des comptes/classes (horaires…) | `{ ... }` |
| `GET /api/ai/conversations` | Toute session (ADMIN peut lire celles d'un autre `userId`) | Conversations IA | `{ conversations }` |
| `POST /api/ai/conversations` | Toute session | Nouvelle conversation IA | `{ conversation }` 201 |
| `GET /api/ai/conversations/[id]` | Propriétaire ou ADMIN | Détail + messages d'une conversation | `{ conversation }` |
| `PATCH /api/ai/conversations/[id]` | Propriétaire ou ADMIN | Renommage / mise à jour | `{ conversation }` |
| `DELETE /api/ai/conversations/[id]` | Propriétaire ou ADMIN | Suppression (cascade des messages) | `{ success }` |
| `GET /api/ai/memory` | Toute session (mémoire de l'utilisateur) | Mémoire longue de l'assistant | `{ memories }` |
| `POST /api/ai/memory` | Toute session | Ajoute un souvenir | `{ memory }` 201 |
| `PUT /api/ai/memory` | Toute session | Met à jour un souvenir | `{ success }` |
| `DELETE /api/ai/memory` | Toute session | Supprime un souvenir ou toute la mémoire | `{ success, deleted }` |
| `GET /api/ai/search-history` | Toute session | Historique de recherche IA | `{ history }` |
| `POST /api/ai/search-history` | Toute session | Enregistre une recherche | `{ entry }` 201 |
| `DELETE /api/ai/search-history` | Toute session | Supprime une entrée ou tout l'historique | `{ success, deleted }` |
| `POST /api/ai/translate` | Toute session | Traduction d'un texte | `{ translation }` |
| `POST /api/ai/upload` | Toute session (destinataire de la conversation) | Pièce jointe document vers l'IA | `{ ... }` |

### 6.16 Visioconférences & cartes

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/meetings` | Toute session (ADMIN voit toutes les réunions de l'école) | Réunions / visioconférences | `{ meetings }` |
| `POST /api/meetings` | ADMIN, TEACHER | Création (instantanée ou programmée) | `{ meeting }` 201 |
| `GET /api/meetings/[id]` | Participant, organisateur ou ADMIN | Détail d'une réunion | `{ meeting }` |
| `PUT /api/meetings/[id]` | Organisateur ou ADMIN | Modification | `{ meeting }` |
| `DELETE /api/meetings/[id]` | Organisateur ou ADMIN | Suppression | `{ success }` |
| `GET /api/meetings/[id]/participants` | Participant | Liste des participants | `{ participants }` |
| `POST /api/meetings/[id]/participants` | Toute session | Rejoindre (salle verrouillée/terminée → 403) | `{ participant }` |
| `PUT /api/meetings/[id]/participants` | Participant (ou organisateur) | Changement d'état (main levée, muet…) | `{ participant }` |
| `POST /api/meetings/[id]/recordings` | ADMIN, TEACHER (organisateur) | Enregistrement / lien d'enregistrement | `{ recording }` |
| `DELETE /api/meetings/[id]/recordings` | ADMIN, TEACHER (organisateur) | Suppression d'un enregistrement | `{ success }` |
| `GET /api/carte/[userId]` | Self, ADMIN, TEACHER (école) | Carte scolaire (par id, matricule ou `cardId`) | `{ card }` |
| `POST /api/users/cards` | ADMIN | Génération/régénération des cartes scolaires de l'école | `{ success, generatedCount }` |

### 6.17 Paiements & frais

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `GET /api/fees` | Toute session (école) | Frais scolaires (types, montants) | `{ fees }` |
| `POST /api/fees` | ADMIN | Création d'un frais | `{ fee }` 201 |
| `GET /api/fees/[id]` | Toute session (école) | Détail d'un frais | `{ fee }` |
| `PUT /api/fees/[id]` | ADMIN | Modification | `{ fee }` |
| `DELETE /api/fees/[id]` | ADMIN | Suppression | `{ success }` |
| `GET /api/fees/[id]/installments` | ADMIN, TEACHER | Échéancier d'un frais | `{ installments }` |
| `POST /api/fees/[id]/installments` | ADMIN | Création d'une échéance | `{ installment }` 201 |
| `GET /api/payments` | ADMIN/CAISSIER (école), PARENT (enfants), STUDENT (lui-même); TEACHER refusé | Lecture seule; retard dérivé après 30 jours, filtres validés, lignes supprimées exclues | `{ payments }` |
| `POST /api/payments` | ADMIN | Création d'un paiement | `{ payment }` 201 |
| `GET /api/payments/[id]` | Toute session (porté) | Détail d'un paiement | `{ payment }` |
| `PUT /api/payments/[id]` | ADMIN | Mise à jour d'un paiement | `{ payment }` |
| `DELETE /api/payments/[id]` | ADMIN | Suppression d'un paiement | `{ message }` |
| `GET /api/tuition` | ADMIN; PARENT (enfants liés seulement, `studentId` vérifié) | Solde par devise, échéances et couverture des frais | `{ students, fees, installments, balances }` par élève |
| `POST /api/tuition` | ADMIN | Relance d'un parent (`remind-parent`), auditée | `{ success }` |
| `POST /api/payments/pawapay` | Public (callback — signature vérifiée) | Initiation de checkout (carte école) | `{ redirectUrl }` |
| `GET /api/payments/pawapay/success` | Public (callback) | Retour succès de la passerelle | redirection/confirmation |
| `GET /api/payments/pawapay/cancel` | Public (callback) | Retour annulation | redirection |
| `POST /api/payments/geniuspay` | Public (callback) — re-export du handler pawapay | Initiation de checkout GeniusPay | `{ redirectUrl }` |
| `GET /api/payments/geniuspay/success` | Public (callback) — re-export | Retour succès | redirection/confirmation |
| `GET /api/payments/geniuspay/cancel` | Public (callback) — re-export | Retour annulation | redirection |

### 6.18 Sync (offline)

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `POST /api/sync` | Toute session | Rejeu d'une opération offline (whitelist : `grades`, `attendance/batch`, `homework`, `notifications/[id]`) | réponse de la cible |
| `POST /api/sync/push` | Toute session (30/min/utilisateur) | Poussée max 50; origine, méthode, chemin autorisé et `schoolId` de session vérifiés; résultats par mutation (le client doit lire `results`, même en HTTP 207) | `{ results }` (200 ou 207) |
| `GET /api/sync/pull` | Toute session (portée par rôle/école) | Delta par entité depuis `?since=`; élèves/parents reçoivent seulement leurs bulletins publiés, parents tous leurs enfants, enseignants leurs classes/cours | `{ cursor, entities, counts }` (limite actuelle 500 lignes/entité; pagination à faire) |

### 6.19 Upload, géolocalisation & divers

| Route | Rôles | Description | Réponse principale |
| --- | --- | --- | --- |
| `POST /api/upload/photo` | Toute session | Avatar de profil (images, 5 Mo max) | `{ url }` |
| `POST /api/upload/message` | Toute session (expéditeur = session) | Pièce jointe de message (25 Mo) | `{ message }` |
| `POST /api/location` | STUDENT | Mise à jour de la position GPS | `{ success, location }` |
| `GET /api/location` | PARENT (ses enfants), ADMIN/TEACHER (école) | Position d'un utilisateur | `{ location }` |

---

## 7. Sécurité connue

Le middleware garantit une session sur toute route `/api/*` hors liste blanche : **aucune route n'est publiquement accessible sans cookie** à l'exception de la liste blanche (§2). Reste sans **vérification de rôle interne** à la route :

| Route | Constat | Impact |
| --- | --- | --- |
| `GET` + `POST /api/debug/env` | ⚠ NON SÉCURISÉE (legacy) — aucun auth dans la route, mais **neutralisée** : répond systématiquement 404 depuis sa désactivation | Nul (aucune donnée exposée) ; cookie middleware requis |
| `GET /api/config?inviteCode=` | Lookup de fiche école **sans test de rôle dans la route** (résultat limité aux champs publics) ; le chemin `schoolId` exige bien une session active | Fuite limitée de métadonnées d'école vers toute session connectée |
| `GET /api/schools/[id]` | Session « optionnelle » par conception : sans session → vue publique restreinte (jamais email/mot de passe/abonnement/inviteCode). Le middleware exige quand même le cookie | Aucun (champs sensibles exclus) |
| `GET /api/reviews`, `POST /api/reviews`, `GET /api/health`, `/api/auth/*`, `payments/pawapay/*`, `payments/geniuspay/*`, `GET /api` | Publiques **par conception** (whitelist middleware) — callbacks de passerelle avec signature vérifiée côté route | Attendu |

Points positifs : CSRF (origin same-origin) sur toutes les écritures, rate limits sur login/forgot/register/push/IA, multi-tenant systématique (`assertSchool` ou `schoolId: auth.schoolId`), verrous de période de note (423), garde double sur `admin/db-health` (`x-admin-secret` + `timingSafeEqual`).

---

## 8. Aide-mémoire des chemins

- 141 fichiers `route.ts` sous `src/app/api/`, **253 points d'entrée** (méthodes exportées `GET/POST/PUT/PATCH/DELETE`, re-exports inclus).
- Tous les chemins ci-dessus sont relatifs à l'origine de l'application (`https://<host>`).
- Paramètres de liste : `page`, `pageSize` (max 100), `orderBy=champ:asc|desc`.
