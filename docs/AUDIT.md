# AUDIT — État des lieux GradeUp (Phase 0)

> Date : 2026-10-14 · Méthode : lecture seule du code + scripts de vérification (`tsc`, `eslint`, `next build`) + contrôle manuel des routes API sensibles. Aucune ligne de code applicative modifiée.
> Rôles : ADMIN, TEACHER (Titulaire), STUDENT, PARENT. Contexte RDC : lent/mobre d'abord, USD/CDF, cotation TJ.

---

## 0. Baseline qualité (mesurée)

| Contrôle | Commande | Résultat |
|---|---|---|
| Types | `npx tsc --noEmit` | **0 erreur** |
| Lint | `npm run lint` | **0 erreur** |
| Build | `npm run build` | **EXIT 0**, `.next/standalone` généré |
| Routes API | décompte `src/app/api/**/route.ts` | **124 routes**, **62 avec auth**, **62 sans** |
| `requireRole` | recherche globale | **0 occurrence** (aucun garde de rôle centralisé) |
| Toasts | 51 fichiers `from 'sonner'` vs 1 `<Toaster/>` shadcn monté | **toasts invisibles dans 51 fichiers** |
| Offline | `queueOrFetch` utilisé dans **4 composants** d'écriture | 57 fichiers en `fetch` nu |
| Baseline serveur | `http://localhost:3000/` | 200 OK, dev relancé |

---

## 1. Synthèse par priorité

### P0 — bloquant (sécurité ou fonctionnel cassé)
1. **`/api/debug/env` sans auth** — affiche préfixe/suffixe de `DEEPSEEK_API_KEY`, présence des secrets (`src/app/api/debug/env/route.ts:17-83`).
2. **Escalade de rôle** — `PATCH/PUT /api/users/[id]` accepte `role` pour tout utilisateur auto-connecté (`src/app/api/users/[id]/route.ts:65,111`) : un étudiant peut se dire ADMIN.
3. **Messagerie sans auth** — 7 routes lisent/écrivent avec un `userId` envoyé par le client (`messages/route.ts:9-92`, `[id]`, `reply`, `conversation`, `reactions`, `unread-count`, `search`) : lecture/impersonation de n'importe quelle conversation.
4. **`GET /api/admin/fix-subscription` sans contrôle de rôle** (`src/app/api/admin/fix-subscription/route.ts:41`).
5. **Reset `db-health` via `JWT_SECRET` en query string** (`src/app/api/admin/db-health/route.ts:52`) — secret transmis en clair dans l'URL/logs.
6. **Toasts invisibles** — `src/app/layout.tsx:4,67` monte le Toaster shadcn, alors que 51 fichiers appellent `toast()` de **sonner** (`src/components/ui/sonner.tsx` jamais monté) : **zéro feedback** sur la majorité des actions.
7. **Devoirs sans filtre `classId`** — `src/app/api/homework/route.ts:13-45` renvoie les devoirs de toute l'école à un élève.
8. **« Régénérer le code parent » cassé** — `POST /api/parent-code` exige `role=STUDENT` (`src/app/api/parent-code/route.ts:18-19`) alors que l'action est côté parent.

> Requalification après vérification manuelle : `student-payments` n'apparaît dans **aucun menu** (seulement le titre `app-layout.tsx:280` et la vue `src/app/page.tsx:103` qui redirige vers le dashboard) → **code mort**, pas un écran visible. Reclassé P2 (§7.4).

### P1 — dégradation sérieuse de l'expérience
- Tables non transformées en cartes sous 768 px ; scroll horizontal sur les tables admin. *(La bottom nav mobile existe déjà : `app-layout.tsx:1066-1114`, seuil 1024 px, padding contenu :981, badges non-lus — vérifiée conforme.)*
- Erreurs avalées (`admin-dashboard.tsx:149,154`, `teacher-dashboard.tsx:50-51`) : l'utilisateur croit que l'action a marché. *(Partiellement traité en Phase 1 pour admin-dashboard.)*
- Devise **USD en dur** dans l'UI admin (`admin-dashboard.tsx:249,260,647,723,751`) alors que le contexte est USD/CDF.
- Aucun état « déjà rendu » pour un devoir ; aucun état vide/chargement homogène.
- Classes Tailwind dynamiques (`teacher-classes.tsx:249-251`) : risque d'élimination Tailwind v4.
- Hydration React 19 préexistante sur `/`, `/faq`, `/help` (script de thème dans l'arbre client) — connue, hors périmètre immédiat.

### P2 — dette / fiabilité
- N+1 : `teacher-dashboard.tsx:41-48` (une requête par classe) ; fetch secondaires silencieux (`admin-users.tsx:156-186`).
- Offline : outbox IndexedDB existante (`src/lib/offline-sync.ts:10-30,56-105,112-131`) mais **4 écritures seulement** branchées : `teacher-grades.tsx:442,547`, `teacher-attendance.tsx:83`, `teacher-homework.tsx:166`, `message-center.tsx:85`. Aucune lecture cachée côté 57 fichiers.
- Aucune i18n (textes en dur FR) ; aucun import CSV (export seulement).
- `typescript.ignoreBuildErrors` historiquement présent (à vérifier dans `next.config`), aucun typecheck CI.

---

## 2. Tableau par rôle — ADMIN

| Module | Fichier(s) | Boutons/actions | Connecté API ? | Données réelles ? | Charg./err./vide ? | Responsive ? | Offline ? | Problèmes | Priorité |
|---|---|---|---|---|---|---|---|---|---|
| Tableau de bord | `admin-dashboard.tsx` | Stats, paiements, export CSV | Oui (`/api/stats`, `/api/payments`) | Partiel | Non / erreurs avalées :149,154 / Non | Non (tables) | Non | USD en dur :249,260,647,723,751 | P1 |
| Utilisateurs | `admin-users.tsx` | CRUD, recherche, rôle | Oui + fetch secondaires :156-186 | Oui | Partiel / Non / Non | Non | Non | fetch silencieux, escalade via API | P1 |
| Classes | `admin-classes.tsx` | CRUD, titulaire | Oui | Oui | Partiel | Non | Non | classes Tailwind dynamiques | P1 |
| Cotation / coefficients | `admin-cotation-rules.tsx`, `admin-coefficients.tsx` | CRUD règles | Oui | Oui | Partiel | Non | Non | — | P1 |
| Validation notes | `admin-grade-validation.tsx` | Valider/rejeter | Oui | Oui | Partiel | Non | Non | chaîne Titulaire→Admin→publication à verrouiller | P1 |
| Bulletins | `admin-reports.tsx`, `auto-report-sync-panel.tsx` | Générer, publier, archiver | Oui (15 fetch) | Oui | Partiel | Non | Non | cycle DRAFT→…→PUBLISHED à confirmer | P1 |
| Présence | `admin-presence.tsx` | Vue école | Oui | Oui | Partiel | Non | Non | — | P2 |
| Paiements | `admin-payments.tsx` | Suivi, encaissement | Oui | Oui | Partiel | Non | Non | devise en dur | P1 |
| Emploi du temps | `admin-schedules.tsx` | CRUD, duplication | Oui | Oui | Partiel | Non | Non | — | P2 |
| Calendrier scolaire | `admin-school-calendar.tsx` | Périodes 1-4, semestres | Oui | Oui | Partiel | Non | Non | — | P2 |
| Cartes / cartes d'état | `admin-cards.tsx`, `admin-passages.tsx` | Générer/imprimer | Oui | Oui | Partiel | Non | Non | impression non testée mobile | P2 |
| Config école / congés | `admin-config.tsx`, `admin-conferences.tsx` | Paramètres | Oui | Oui | Partiel | Non | Non | — | P2 |
| Notifications | `admin-notifications.tsx` | Envoyer | Oui | Oui | Partiel | Non | Non | pas de confirmation de diffusion | P2 |
| Santé BDD | `admin/db-health/route.ts` | Check/reset | Oui | — | — | — | — | **reset via JWT_SECRET en query** | P0 |
| Debug env | `api/debug/env/route.ts` | GET/POST | Oui | — | — | — | — | **expose préfixes de secrets, sans auth** | P0 |

## 3. Tableau par rôle — TEACHER (Titulaire)

| Module | Fichier(s) | Boutons/actions | Connecté API ? | Données réelles ? | Charg./err./vide ? | Responsive ? | Offline ? | Problèmes | Priorité |
|---|---|---|---|---|---|---|---|---|---|
| Cahier de cotation | `cahier-cotation.tsx` (931 l.) | Saisir TJ/interrogations/devoirs/examens, « Envoyer au titulaire » | Oui | Oui | Partiel | Non | Partiel (:442) | monolithe, flux de validation à clarifier | P1 |
| Dashboard | `teacher-dashboard.tsx` | Aperçu classes | Oui | Oui | Oui / catch muet :50-51 / Oui | Non | Non | N+1 :41-48 | P1 |
| Mes classes | `teacher-classes.tsx`, `teacher-courses.tsx` | Détail classe/élèves | Oui | Oui | Partiel | Non | Non | classes Tailwind dynamiques :249-251 | P1 |
| Devoirs | `teacher-homework.tsx` | CRUD, noter | Oui | Oui | Partiel | Non | Partiel (:166) | — | P1 |
| Présence | `teacher-attendance.tsx` | Appel | Oui | Oui | Partiel | Non | Partiel (:83) | — | P1 |
| Documents | `teacher-documents.tsx` | Upload | Oui | Oui | Partiel | Non | Non | — | P2 |
| Modifications de notes | `api/note-modifications/[id]` | Approuver/refuser | Partiel | Oui | — | — | — | vérifier rôle serveur (escalade possible) | P0 |
| Widget présence | `presence-widget.tsx` | Rapide | Oui | Oui | Partiel | Oui | Non | — | P2 |

## 4. Tableau par rôle — STUDENT

| Module | Fichier(s) | Boutons/actions | Connecté API ? | Données réelles ? | Charg./err./vide ? | Responsive ? | Offline ? | Problèmes | Priorité |
|---|---|---|---|---|---|---|---|---|---|
| Dashboard | `student-dashboard.tsx` | Raccourcis | Oui | Facultatif | Partiel | Non | Non | citations en dur :28-34 | P2 |
| Notes | `student-grades.tsx` | Consulter | Oui | Oui | Partiel | Non | Non | — | P1 |
| Devoirs | `student-homework.tsx` | Rendre un devoir | Oui | Oui | Non | Non | Non | pas d'état « déjà rendu », filtre `classId` absent côté API | P0 |
| Bulletins | `student-bulletins.tsx` | Consulter/imprimer | Oui | Oui | Partiel | Non | Non | — | P2 |
| **Paiements** | `page.tsx:103` redirige vers le dashboard | — | — | — | — | — | — | **code mort** : `PageView` déclaré (`types.ts:333`, titre `app-layout.tsx:280`) mais absent des menus → supprimer ou brancher (zéro bouton mort) | P2 |
| IA GradieChat | `GradieChat.tsx`, `ai-chat.tsx` | Chat | Oui (17 fetch) | Oui | Partiel | Oui | Non | clé côté serveur ok, rate-limit à voir | P2 |

## 5. Tableau par rôle — PARENT

| Module | Fichier(s) | Boutons/actions | Connecté API ? | Données réelles ? | Charg./err./vide ? | Responsive ? | Offline ? | Problèmes | Priorité |
|---|---|---|---|---|---|---|---|---|---|
| Dashboard | `parent-dashboard.tsx` | Vue enfants | Oui | Oui | Partiel | Non | Non | 9 fetch sans coordination | P1 |
| Bulletins | `parent-bulletins.tsx` | Consulter | Oui | Oui | Partiel | Non | Non | — | P2 |
| Notes | `parent-grades.tsx` | Consulter | Oui | Oui | Partiel | Non | Non | — | P1 |
| Paiements | `parent-payments.tsx` | Historique | Oui | Oui | Partiel | Non | Non | — | P1 |
| Notifications | `parent-notifications.tsx` | Lire | Oui | Oui | Partiel | Non | Non | — | P2 |
| Code parent | `api/parent-code/route.ts` | Régénérer | **Cassé** | — | — | — | — | rôle exigé = STUDENT :18-19 | P0 |

## 6. Modules transversaux

| Module | Fichier(s) | Boutons/actions | Connecté API ? | Données réelles ? | Charg./err./vide ? | Responsive ? | Offline ? | Problèmes | Priorité |
|---|---|---|---|---|---|---|---|---|---|
| Messagerie | `message-center.tsx`, `chat-page.tsx` | Envoyer, réagir, rechercher | Oui (7 routes **sans auth**) | Oui | Partiel | Non | Partiel (:85) | IDOR + impersonation | P0 |
| Meetings | `meetings-hub.tsx`, `meeting-room.tsx` | Créer, rejoindre | Oui | Oui | Partiel | Oui | Non | — | P2 |
| Bibliothèque | `library-hub.tsx` | Ressources, favoris | Oui | Oui | Partiel | Oui | Non | — | P2 |
| Calendrier | `admin-school-calendar.tsx` | Périodes | Oui | Oui | Partiel | Non | Non | — | P2 |
| Notifications/realtime | `notification-permission-banner.tsx` | Permission navigateur | Oui | Oui | Partiel | Oui | Non | pas de file d'attente offline | P2 |
| Profil | `app-layout.tsx` + `api/users/[id]` | Éditer profil/mot de passe | Oui | Oui | Partiel | Oui | Non | **escalade de rôle** :111 | P0 |
| Aide / FAQ | `/faq`, `/help` | Accordéons | Statique | Oui | — | Oui | — | hydration React 19 préexistante | P2 |
| Offline/sync | `offline-sync.ts`, `offline-sync-manager.tsx` | Synchroniser | Oui | — | Oui | Oui | — | 4 écritures branchées seulement | P1 |
| Shell / navigation | `page.tsx`, `app-layout.tsx` | Navigation 4 rôles | — | — | Splash local | Bottom nav **absente** | Indicateur offline absent | P1 |

---

## 7. Listes séparées (fichier:ligne)

### 7.1 Boutons / actions inactifs ou cassés
- `student-payments` : code mort (hors menus) — `page.tsx:103`, `app-layout.tsx:280`, `types.ts:333` → supprimer ou brancher.
- `parent-code` régénérer : `api/parent-code/route.ts:18-19` (rôle STUDENT) — **reste à corriger (Phase 3)**.
- ~~Toasts non montés (51 fichiers `from 'sonner'`)~~ → **corrigé Phase 1** : `<SonnerToaster />` ajouté dans `src/app/layout.tsx:5,69` (Toaster shadcn conservé pour les 6 fichiers `use-toast`).
- Erreurs avalées : `admin-dashboard.tsx` → **corrigé Phase 1** (`loadError` + `<ErrorBanner onRetry>` sur stats/paiements) ; `teacher-dashboard.tsx:50-51` **reste à corriger (Phase 4)**.

### 7.2 Données en dur / fictives
- USD écrit en dur : `admin-dashboard.tsx:249,260,647,723,751`.
- Citations motivation : `student-dashboard.tsx:28-34`.
- Textes UI non i18n : partout (aucune lib i18n dans le projet).

### 7.3 Appels API manquants ou orphelins
- 62/124 routes sans authentification.
- Lecture hors-ligne non branchée (57 fichiers en `fetch` nu).
- `fix-subscription` GET sans rôle : `api/admin/fix-subscription/route.ts:41`.
- Vérifier : `note-modifications/[id]` (approbation par un non-admin), `report-cards` publication.

### 7.4 Incohérences schéma / types / UI
- `Prisma` (51 modèles) vs `src/lib/types.ts` : comparaison à figer dans la doc ; usage mixte `ReportCard`/`Bulletin`/`ReportCounter` pour le cycle de bulletin.
- `UserRole` (`types.ts`) vs `role` accepté en PUT utilisateur : divergence assumée côté client, non contrôlée côté serveur.

### 7.5 Failles de sécurité (à corriger en Phase sécurité)
| Faille | Fichier:ligne | Gravité |
|---|---|---|
| Escalade de rôle via `role` dans l'édition profil | `api/users/[id]/route.ts:65,111` | Critique |
| Messagerie sans auth (7 routes) | `api/messages/**` | Critique |
| Exposition de préfixes de secrets | `api/debug/env/route.ts:17-83` | Haute |
| Reset BDD via `JWT_SECRET` en query | `api/admin/db-health/route.ts:52` | Haute |
| `fix-subscription` GET sans rôle | `api/admin/fix-subscription/route.ts:41` | Haute |
| Devoirs visibles toute l'école | `api/homework/route.ts:13-45` | Haute |
| IDOR messagerie (userId client) | `api/messages/[id]/route.ts:48-59` | Haute |
| IDOR notes (`[id]` sans `schoolId`/rôle) | `api/grades/[id]` (à confirmer) | Haute |
| Aucun `requireRole` centralisé | `src/lib/auth/*` | Structurelle |

---

## 8. Checklist de fin de Phase 0
- [x] Modules ADMIN inventoriés (16 lignes)
- [x] Modules TEACHER inventoriés (8 lignes)
- [x] Modules STUDENT inventoriés (6 lignes)
- [x] Modules PARENT inventoriés (6 lignes)
- [x] Modules transversaux inventoriés (9 lignes)
- [x] Aucune section vide
- [x] Listes séparées remplies (actions, données en dur, API manquantes, incohérences, sécurité)
- [x] Priorités P0/P1/P2 attribuées
- [x] Baseline build/lint/typecheck consignée (§0)
- [x] Aucune modification de code applicatif (hors `docs/`)
