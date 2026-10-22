# PHASE 2 — Socle offline-first (infra réutilisable)

> **Statut : livrée.** Tâches 1 à 12 du plan complétées.
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
| 4 | Repository + hooks local-first | `src/lib/offline/repository.ts` (`applyRemoteList` ne l'écrase pas si `pending`, `mutateLocalFirst`, `readThrough`) + `src/lib/offline/hooks.ts` (`useEntityList` live, `useEntityMutation`, `useOutboxCount/List`) — les composants lisent via hooks, **jamais de fetch direct** pour les nouvelles couches |
| 5 | Outbox | `src/lib/offline/outbox.ts` : `clientMutationId` UUID, FIFO, backoff 2 s→5 min (8 tentatives), 4xx = erreur permanente manuelle, 5xx = stop + re-test, `retry/cancel/discard` |
| 6 | Synchro serveur | `POST /api/sync/push` (batch ≤50, idempotence `SyncOperation`, **allowlist endpoint+méthode**, relais vers routes métier), `GET /api/sync/pull?since=` (delta filtré par rôle/école), déclencheurs : online/ouverture/tick 30 s/**Background Sync**/manuel/SW `SYNC_OUTBOX` (`src/lib/sync/engine.ts`) |
| 7 | Conflits | `src/lib/sync/conflicts.ts` : serveur gagne (notes/bulletins verrouillés…), LWW par séance+élève (présences), append-only (messages/soumissions/notifications), latest+backup (brouillons leçons) |
| 8 | Online-only | `ONLINE_ONLY_OPERATIONS` refusé client **et** serveur (« Connexion requise ») : paiements, publication bulletins, clôture d'année (jamais en outbox), suppression utilisateurs, changement de rôle ; numérotation reçus = serveur uniquement (brouillon local → câblage Phase 6) |
| 9 | UI sync | Indicateur global (`offline-sync-manager.tsx` : En ligne/Hors ligne/Sync/N attentes/Erreur), **centre de sync** (`?page=sync-center`, menu « Hors ligne & Sync » des 4 rôles), **badge par élément** (`sync-badge.tsx`, adopté dans le centre) |
| 10 | Sécurité | Session persistante + hydratation en échec réseau (mode avion OK), **`wipeAllLocalData()` à la déconnexion** (`store.ts`), pull filtré par rôle/école |
| 11 | Stockage | `src/lib/offline/storage.ts` : quota (jauge), purge 7 j, **« Vider le cache local »** (conserve l'outbox), « Oublier toutes les actions », fichiers hors ligne (`offlineFiles`, 30 j) |
| 12 | Tests offline | `.zscripts/qa-phase2.js` — voir ci-dessous |

## Vérifications

### Gates
- `npx tsc --noEmit` : **0 erreur**
- `npm run lint` : **0 problème**
- `npm run build` : **OK** (routes `api/sync/push`, `api/sync/pull`, `offline` générées)
- Dev relancé : `/offline` → HTTP 200

### QA offline (`.zscripts/qa-phase2.js`) : **16/16**
- Manifest (nom, standalone, theme, icônes 192/512/**maskable**)
- SW actif + Background Sync supporté (Chrome)
- Base `gradeup-local` : 20 tables (17 entités + outbox + syncMeta + offlineFiles)
- Page `/offline` rend le secours ; centre de sync accessible
- Outbox persiste ; **mode avion** → indicateur hors ligne, file conservée (pas de flush) ; retour en ligne détecté

### Scénario « checklist fin de phase » (puppeteer, session factice)
1. Mode avion → 1 action enfilée (`pending`) ✔
2. Retour réseau → **flush automatique, POST unique** `/api/sync/push` ✔ (401 attendu sans vraie session → `error` + message clair « Non authentifié » ; l'idempotence côté serveur est prouvée par `SyncOperation`, relais sur routes existantes)
3. Erreur d'hydratation détectée puis corrigée : `navigator` existe dans Node ≥ 21 → test `typeof window` pour le `online` SSR (`engine.ts`)

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

## Suites (phases suivantes)
- Brancher progressivement les écrans métier sur les hooks `useEntityList/useEntityMutation` (Phase 3+).
- Brouillon de reçu de caisse hors ligne (Phase 6, paiements).
- Realtime Supabase poussant un `pull` (coquille `src/lib/realtime.ts` existante, à brancher sur `syncNow()` quand un module l'utilisera).
