# GradeUp — Synchronisation hors ligne (SYNC)

> Socle technique de la Phase 2. Ce document décrit l'architecture de
> synchronisation, les règles de résolution de conflits et les opérations
> restreintes au mode en ligne.

## 1. Vue d'ensemble

```
┌──────────── Composant ────────────┐
│  hooks useXxx (useLiveQuery Dexie)│  ← lecture locale d'abord, UI réactive
└──────────────┬────────────────────┘
               │ mutate / read
┌──────────────▼────────────────────┐
│  repository (src/lib/offline)     │  ← écriture locale optimiste + upsert
└──────────────┬────────────────────┘
               │ enqueue (clientMutationId UUID)
┌──────────────▼────────────────────┐
│  OUTBOX (table Dexie 'outbox')    │  ← FIFO, backoff, erreurs permanentes
└──────────────┬────────────────────┘
               │ flushOutbox() (trigger : online, tick 30 s, ouverture, BGSync)
┌──────────────▼────────────────────┐
│  POST /api/sync/push (batch)      │  ← idempotence (SyncOperation), allowlist
└──────────────┬────────────────────┘
               │ relais vers routes métier existantes (validation préservée)
┌──────────────▼────────────────────┐
│  GET /api/sync/pull?since=        │  ← delta par entité, rôle, établissement
└──────────────┬────────────────────┘
               │ applyRemoteList (skip records locaux pending)
┌──────────────▼────────────────────┐
│  Tables Dexie (gradeup-local)     │  ← l'UI se met à jour via live queries
└───────────────────────────────────┘
```

## 2. Base locale (Dexie)

Base `gradeup-local`, **une table par entité** (voir `src/lib/offline/db.ts`) :
`users, classes, courses, lessons, grades, gradeSnapshots, homework,
submissions, attendance, schedules, reportCards, bulletins, payments,
messages, events, resources, notifications` + `outbox` + `syncMeta` +
`offlineFiles`.

Chaque enregistrement porte l'enveloppe :

| Champ | Rôle |
|---|---|
| `id` | UUID client (ou id serveur après synchro) |
| `schoolId` | multi-tenant (index) |
| `updatedAt` | epoch ms — delta pull + purge |
| `version` | incrémente à chaque écriture locale (détection conflit) |
| `syncStatus` | `'synced' \| 'pending' \| 'error' \| 'conflict'` |
| `deletedAt` | soft delete (tombstone) |
| `syncError` | message d'erreur si `error`/`conflict` |

Les records locaux `pending`/`error`/`conflict` **ne sont jamais écrasés**
par un pull distant (protection des mutations non encore envoyées).

## 3. Outbox (file d'actions)

`src/lib/offline/outbox.ts`. Chaque mutation est enregistrée avec :

- `clientMutationId` : **UUID unique = clé d'idempotence** (même
  clientMutationId = même résultat côté serveur, pas de doublon).
- `entity`, `operation`, `recordId`, `payload`, `endpoint`, `method`.
- `attempts` + `nextAttemptAt` : **backoff exponentiel** (2 s × 2^n, plafonné
  à 5 min), 8 tentatives max avant passage en erreur « définitive ».
- `status` : `pending` → `inflight` → (`done` supprimé | `error` | `conflict`).

### Comportement du flush (`flushOutbox`)
- Ordre **FIFO** par `createdAt` (préserve l'ordre des mutations liées).
- **2xx** → action supprimée, record local marqué `synced`.
- **4xx** → erreur **permanente** : action passe en `error` (ou `conflict` si
  409), affichée dans le centre de sync avec bouton « Réessayer »/« Annuler ».
  Ne bloque pas la suite de la file.
- **5xx / erreur réseau** → backoff, **on arrête le flush** (préserve l'ordre)
  et on re-teste au prochain déclencheur.

### Déclencheurs de synchronisation
1. Au retour du réseau (`window online`).
2. À l'ouverture de l'app (`start()` du moteur).
3. Périodiquement (tick 30 s).
4. **Background Sync** (service worker, tag `gradeup-outbox`) quand supporté.
5. Manuellement (bouton « Synchroniser » du centre de sync).
6. Message SW `SYNC_OUTBOX` → `syncNow()`.

## 4. Endpoints de synchronisation

### `POST /api/sync/push` (batch de mutations)
- Auth obligatoire (`authenticateRequest`).
- Pour chaque mutation :
  1. **Idempotence** : registre Prisma `SyncOperation` (clé =
     `clientMutationId`). Si déjà traité → renvoie le résultat enregistré.
  2. **Online-only** : refuse les opérations sensibles (cf. §6) → 403 avec
     « Connexion requise ».
  3. **Allowlist** : l'`endpoint`+`method` doit matcher une route autorisée
     (sinon 400 « Opération offline non autorisée »).
  4. **Relais** vers la route métier existante (cookie + `x-idempotency-key`),
     ce qui conserve **toute la validation** (rôles, année scolaire, règles RDC).
- Batch max 50 mutations.

Routes rejouables (allowlist `src/app/api/sync/push/route.ts`) :
`attendance/batch`, `grades`(+[id]), `homework`(+[id]), `submissions`(+[id]),
`messages`, `notifications/[id]`, `lessons`(+[id]), `schedules`(+[id]),
`resources`(+[id]), `events`(+[id]).

> L'ancien `POST /api/sync` (proxy legacy des 4 composants historiques) est
> conservé pour compatibilité ; il a été corrigé côté client pour le nouveau
> socle (`offline-sync.ts` délègue désormais à l'outbox Dexie).

### `GET /api/sync/pull?since=<ISO|epoch>` (delta)
- Retourne `{ cursor, entities, counts }` : enregistrements modifiés depuis
  `since`, **par entité**, bornés à 500 lignes/entité.
- **Filtrage par rôle et établissement** :
  - `ADMIN` : toute l'école.
  - `TEACHER` : ses classes/cours/notes devoirs, users STUDENT/TEACHER.
  - `STUDENT` : ses données (notes, présences, devoirs, bulletins, paiements).
  - `PARENT` : celles de ses enfants.
- Les entités sans `updatedAt` (submissions/messages/notifications) utilisent
  `submittedAt`/`createdAt` pour le delta.

## 5. Résolution de conflits

Définies dans `src/lib/sync/conflicts.ts`, appliquées à l'écriture/pull :

| Entité | Règle | Comportement |
|---|---|---|
| **Notes** (`grades`), snapshots, bulletins, users, classes, courses, homework, schedules, paiements, events, resources | `server-wins` | Le serveur gagne ; le client est averti (statut `conflict` dans l'outbox). |
| **Présences** (`attendance`) | `last-write-wins-per-key` | Dernière écriture par séance (élève + date + cours) gagne. |
| **Messages, soumissions, notifications** | `append-only` | Aucun conflit : on ajoute, on n'écrase jamais. |
| **Brouillons de leçons** (`lessons`) | `latest-with-backup` | La version la plus récente gagne ; une copie de sauvegarde de l'autre version est conservée. |

Le serveur renvoie **409** quand il refuse une mutation pour conflit ; l'action
passe en `conflict` dans l'outbox et apparaît dans le centre de sync.

## 6. Opérations sensibles = ONLINE-ONLY

Interdites hors ligne (rejetées par le serveur **et** refusées par le client
avec « **Connexion requise** »), cf. `ONLINE_ONLY_OPERATIONS` :

- **Paiements** : création (`payments:create`).
- **Publication officielle de bulletins** : `bulletins:update`,
  `reportCards:update` (validation/publication).
- **Clôture d'année** : (module `admin-end-of-year`, jamais dans l'outbox).
- **Suppression d'utilisateurs** : `users:delete`.
- **Modification de rôles** : `users:update`.

**Exception — reçu de caisse hors ligne** : un admin peut saisir un reçu hors
ligne ; il est stocké en **« brouillon local à confirmer »** (statut local
`pending`, endpoint refusé par le serveur tant qu'il n'est pas en ligne) et reçoit sa
**numérotation définitive attribuée par le serveur** au moment de la
synchronisation. La numérotation n'est jamais générée côté client.

> Pour l'instant, la création de paiements n'est pas dans l'allowlist push :
> toute tentative hors ligne échoue en 403 avec le message clair, ce qui force
> la saisie en ligne. Le brouillon de reçu sera câblé dans la Phase 6
> (paiements) sur cette même base.

## 7. UI de synchronisation

- **Indicateur global** (`offline-sync-manager.tsx`, monté dans le layout) :
  En ligne / Hors ligne / Synchronisation en cours / N actions en attente /
  Erreur, avec lien « Voir » vers le centre en cas de souci.
- **Centre de synchronisation** (`?page=sync-center`, menu « Hors ligne & Sync ») :
  liste des actions en attente (statut, tentatives, erreur), boutons
  **Réessayer** / **Annuler**, **Synchroniser**, quota de stockage,
  **Purger les données anciennes**, **Vider le cache local**,
  « Oublier toutes les actions ».
- **Badge par élément** : les records non synchronisés portent
  `syncStatus !== 'synced'` (les composants peuvent afficher un badge
  « En attente » sur la carte concernée).

## 8. Cache (service worker)

`src/app/sw.ts` (Serwist) :

| Type | Stratégie | Cache |
|---|---|---|
| App shell + assets (precache) | Precache | `precache-v2` |
| Pages (navigations) | NetworkFirst + fallback `/offline` | `gradeup-pages-cache` |
| API GET (lecture) | NetworkFirst (4 s) | `gradeup-api-cache` |
| API POST/PUT/DELETE | NetworkOnly (jamais caché) | — |
| Fichiers lourds (PDF, uploads) | **CacheFirst** (cache à la demande) | `gradeup-files-cache` |
| Images | StaleWhileRevalidate, 200 entrées / 14 j | `gradeup-images-cache` |
| Fonts/styles | CacheFirst | `gradeup-assets-cache` |

Les fichiers peuvent aussi être téléchargés explicitement pour lecture hors
offline via `downloadFileForOffline(url, schoolId)` (`offlineFiles` table).

## 9. Sécurité hors ligne

- Session : cookies JWT `gradeup_token` (15 min) + `gradeup_refresh` (7 j).
  `hydrateSession` conserve la session locale si le réseau échoue (mode avion).
- **Déconnexion** : `wipeAllLocalData()` supprime **toute** la base Dexie
  (données + outbox + fichiers) — rien ne subsiste d'un autre utilisateur.
- **Verrouillage par rôle** : le `pull` ne renvoie que les données autorisées
  au rôle ; les tables locales sont remplies uniquement via ce flux filtré.
- **Expiration** : purge automatique des records `synced` de plus de 7 jours
  (rétention configurable) + purge des fichiers de plus de 30 jours.

## 10. Tests offline (rappel de recette)

1. Mode avion → ouvrir l'app installée, naviguer, lire les données déjà chargées.
2. Créer une action (pointage) hors ligne → badge « En attente ».
3. Revenir en ligne → l'action part **automatiquement**, **sans doublon**
   (vérifier une seule ligne côté base + `SyncOperation`).
4. Couper le réseau **pendant** un envoi → le flush s'arrête proprement, re-test
   au retour réseau (backoff).
5. Double envoi simulé (même `clientMutationId`) → une seule écriture serveur.
6. Conflit (note verrouillée modifiée hors ligne) → 409, statut `conflict`,
   message dans le centre de sync.
7. Redémarrer l'app avec file en attente → la file persiste (IndexedDB) et se
   vide au retour réseau.
