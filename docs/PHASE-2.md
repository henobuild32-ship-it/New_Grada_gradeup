# PHASE 2 — Socle offline-first (infra réutilisable)

> **Statut : en cours.** Les composants et endpoints sont présents. Les écrans élève Paiements, Bulletins, Présences, Cours, Leçons, Notes et Emploi du temps, « Mes cours » professeur (cours, élèves, notes, horaires et leçons), les horaires du professeur et les notes/paiements/bulletins du parent lisent maintenant leur cache IndexedDB avant le réseau; les autres modules ne sont pas encore raccordés et une synchronisation bout en bout hors ligne avec session valide reste à démontrer.
> Architecture détaillée et règles métier : [`docs/SYNC.md`](./SYNC.md).

## Périmètre

Infrastructure technique **générique** posée pour tous les modules (sans réécrire
les écrans existants) : cache PWA, base locale Dexie, outbox idempotente,
endpoints push/pull, résolution de conflits, UI de synchronisation, sécurité et
stockage. Aucune modification Supabase/stack. Les 4 composants historiques
utilisant `offline-sync.ts` continuent de fonctionner (couche de compat).

## Livrables par tâche

| # | Tâche | Livrable |
|---|---|---|
| 1 | PWA installable | `src/app/manifest.ts` (id/scope/shortcuts/override), bannière install existante (`pwa-install-dialog`, `use-pwa-install`, `pwa-update-manager`), **`src/app/offline/page.tsx`** (secours), registration SW corrigée (`layout.tsx` : prête → enregistre immédiat) |
| 2 | Stratégies de cache | `src/app/sw.ts` : precache shell, NetworkFirst pages + API GET, NetworkOnly écritures, **CacheFirst fichiers** (`gradeup-files-cache`), images limitées/expirées (200/14 j), fallback `/offline` |
| 3 | Base locale | `src/lib/offline/db.ts` : Dexie `gradeup-local`, **une table par entité** (17 entités) + enveloppe `id/schoolId/updatedAt/version/syncStatus/deletedAt` (`types.ts`) |
| 4 | Repository + hooks local-first | `src/lib/offline/repository.ts` (`applyRemoteList` ne l'écrase pas si `pending`, `mutateLocalFirst`, `readThrough`) + `src/lib/offline/hooks.ts` (`useEntityListState` avec extraction de réponses enveloppées, cache local filtré, erreur/reconnexion, `useEntityList`, `useEntityMutation`, `useOutboxCount/List`) — adoptés pour les lectures élève, « Mes cours », l'emploi du temps élève/professeur et les lectures parent; la plupart des autres modules appellent encore leur API directement |
| 5 | Outbox | `src/lib/offline/outbox.ts` : `clientMutationId` UUID, FIFO, backoff 2 s→5 min (8 tentatives), 4xx = erreur permanente manuelle, 5xx = stop + re-test, `retry/cancel/discard` |
| 6 | Synchro serveur | `POST /api/sync/push` (batch ≤50, idempotence `SyncOperation`, allowlist endpoint+méthode+origine, établissement vérifié, relais vers routes métier), `GET /api/sync/pull?since=` (delta filtré par rôle/école), déclencheurs : online/ouverture/tick 30 s/Background Sync/manuel/SW `SYNC_OUTBOX` (`src/lib/sync/engine.ts`) |
| 7 | Conflits | `src/lib/sync/conflicts.ts` déclare serveur gagnant, LWW par séance, append-only et brouillon latest+backup. Le dépôt ne fait actuellement que préserver les lignes locales pending/error/conflict; `resolveConflict()` n'est pas branché au pull, donc les autres règles restent à implémenter et tester. |
| 8 | Online-only | `ONLINE_ONLY_OPERATIONS` refuse côté serveur (`payments:create`, mises à jour `bulletins/reportCards`, `users:delete/update`; `users:update` couvre aussi les changements de profil). La clôture d'année est hors allowlist mais son garde client « Connexion requise » reste à intégrer; le brouillon local de reçu n'est pas câblé. |
| 9 | UI sync | Indicateur global (`offline-sync-manager.tsx` : En ligne/Hors ligne/Sync/N attentes/Erreur), **centre de sync** (`?page=sync-center`, menu « Hors ligne & Sync » des 4 rôles), **badge par élément** (`sync-badge.tsx`, adopté dans le centre) |
| 10 | Sécurité | Session persistante + hydratation en échec réseau (mode avion OK), **`wipeAllLocalData()` à la déconnexion** (`store.ts`), pull filtré par rôle/école |
| 11 | Stockage | `src/lib/offline/storage.ts` : quota (jauge), purge 7 j, **« Vider le cache local »** (conserve l'outbox), « Oublier toutes les actions », fichiers hors ligne (`offlineFiles`, 30 j) |
| 12 | Tests offline | `.zscripts/qa-phase2.js` — voir ci-dessous |

## Vérifications

### Gates
- `npm run lint` et `npx tsc --noEmit` passent après les changements des hooks et des pages élève.
- `npm run build` passe sur ce même état; avertissement non bloquant sur la convention Next `middleware` et la config Prisma.
- Serveur standalone lancé avec `.env.local` explicitement chargé : `/api/health` répond HTTP 200 sur la base PostgreSQL isolée et `npm run test:rbac` passe à **79/79** sur le build de production. Sans ce chargement, le serveur utilisait la `DATABASE_URL` de `.env`, inaccessible depuis cet environnement.

### QA offline (`.zscripts/qa-phase2.js`)

- Un passage antérieur avait rapporté **16/16 contrôles d'infrastructure** avant l'intégration des écrans métier.
- Nouvelle tentative le 2026-10-24 : **non exécutée**, le module `puppeteer-core` requis par ce script n'est pas installé dans le dépôt. Après activation annoncée par l'utilisateur, l'outil de navigateur retourne encore « Local browser use is disabled in Work settings ».
- Ces contrôles d'infrastructure ne couvrent de toute façon pas une mutation avec session authentifiée; ce scénario reste ouvert.

Contrôles couverts par le script lors du passage antérieur :
- Manifest (nom, standalone, theme, icônes 192/512/**maskable**)
- SW actif + Background Sync supporté (Chrome)
- Base `gradeup-local` : 20 tables (17 entités + outbox + syncMeta + offlineFiles)
- Page `/offline` rend le secours ; centre de sync accessible
- Outbox persiste ; **mode avion** → indicateur hors ligne, file conservée (pas de flush) ; retour en ligne détecté

### Scénario hors ligne réel
- Le parcours automatisé disponible utilise une session factice; le `401` reçu après reconnexion ne vérifie pas la réussite d'une mutation authentifiée ni son absence de doublon. Cette checklist n'est donc **pas validée de bout en bout**.
- Défauts trouvés pendant la reprise : le client pouvait traiter HTTP `207` comme une réussite sans lire le résultat par mutation; l'allowlist du push validait le chemin mais pas l'origine du relais; le pull pouvait inclure des bulletins non publiés et des codes parent, et ne couvrait que le premier enfant d'un parent.
- Correctifs appliqués : résultat push contrôlé par `clientMutationId`, origine et schoolId vérifiés, et portée du pull durcie par rôle/école, classes et visibilité. Vérifications ci-dessous.
- Reprise du 2026-10-24 : **79/79 contrôles RBAC réussis**, incluant le refus d'un hôte externe, l'isolation du `schoolId`, les scopes de pull STUDENT/PARENT/TEACHER, l'isolation des annonces, le refus du registre paiements aux enseignants, le scope des horaires, cours, leçons et notes, ainsi que les listes utilisateurs bornées par rôle sans secrets. Lint, TypeScript et `npm run build` passent après les intégrations et leurs ajustements mobiles.
- Intégration supplémentaire : `student-payments`, `student-bulletins`, `student-attendance`, `student-courses`, `student-lessons`, `student-grades`, `teacher-courses`, `schedules-page`, `weekly-schedule-view`, `parent-grades`, `parent-payments` et `parent-bulletins` lisent Dexie et rafraîchissent à la reconnexion. Les écrans parent partagent une sélection d'enfant persistée; les données enfants sont extraites d'un endpoint parent assaini. Les horaires sont indexés par classe, l'API ne renvoie que les classes autorisées, et les caches affichent une erreur avec une action de réessai si le réseau échoue. Les bulletins parent ne sont visibles que pour l'enfant sélectionné et publiés. Ces écrans restent en lecture seule hors ligne.
- Le listing `/api/users` impose le profil propre de l'élève, les enfants du parent et les élèves des cours du professeur; le caissier ne voit que les élèves. Les champs sensibles sont exclus des réponses non-admin. La route parent dédiée écarte aussi les comptes supprimés.
- `/api/courses`, `/api/lessons` et `/api/grades` filtrent maintenant les lectures des professeurs à leurs cours; cours et leçons sont aussi limités aux classes inscrites de l'élève et aux classes de ses enfants pour le parent.
- Reste à vérifier : une mutation réelle authentifiée en mode avion, reprise après redémarrage, retry après coupure, doublon idempotent et accès au cache après révocation de session. Les politiques LWW/append-only/sauvegarde ne sont pas encore appliquées par le repository.

## Fichiers ajoutés
```
src/lib/offline/     types.ts db.ts outbox.ts repository.ts hooks.ts storage.ts index.ts
src/lib/sync/        engine.ts conflicts.ts
src/app/api/sync/    push/route.ts  pull/route.ts
src/app/             offline/page.tsx  sw.ts (réécrit)
src/components/gradeup/  sync-center.tsx  sync-badge.tsx  offline-sync-manager.tsx (réécrit)
docs/SYNC.md         docs/PHASE-2.md
```
Compat : `src/lib/offline-sync.ts` (délègue au nouvel outbox), `api/sync/route.ts` conservé.

## Critères encore ouverts
- Raccorder les écrans métier aux repositories : lectures élève des paiements, bulletins, présences, cours, leçons, notes et horaires, « Mes cours » et horaires enseignant, et lectures parent des notes, paiements et bulletins intégrés; la plupart des autres écrans appellent encore les API directement.
- Ajouter une pagination delta robuste quand une entité dépasse 500 enregistrements (le curseur global actuel peut sauter des lignes).
- Câbler les politiques de conflits déclarées dans `conflicts.ts`; seul le maintien des mutations locales en attente est actuellement appliqué pendant un pull.
- Vérifier la suppression/révocation des données locales et les tombstones pour toutes les entités.
- Compléter l'intégration des mutations authentifiées avant de déclarer la phase terminée.

## Suites (phases suivantes)
- Brancher progressivement les écrans métier sur les hooks `useEntityList/useEntityMutation` (Phase 3+).
- Brouillon de reçu de caisse hors ligne (Phase 6, paiements).
- Realtime Supabase poussant un `pull` (coquille `src/lib/realtime.ts` existante, à brancher sur `syncNow()` quand un module l'utilisera).
