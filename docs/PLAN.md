# PLAN — Amélioration A→Z de GradeUp (post-audit Phase 0)

> Source : `docs/AUDIT.md` · Règles : mobile-first (360-400 px, cibles ≥ 44 px) · offline-first · zéro bouton mort · tout connecté entre rôles · sécurité serveur par rôle · TypeScript strict, a11y, FR, clair/sombre · **on améliore sans réécrire, rien à casser** · fin de phase = build/lint/typecheck + `docs/PHASE-X.md` + checklist manuelle mobile/offline.
> Supabase/stack existante : **ne pas toucher**. Sécurité : **audit en Phase 0, correction en dernière phase** (sauf correctifs bloquants déjà listés P0 qui ne peuvent attendre sans rendre l'app inutilisable).

---

## Principes d'exécution

1. Une phase = un périmètre fermé, livrable, testable ; build vert obligatoire avant de passer à la suivante.
2. Aucun module n'est réécrit : on greffe (`queueOrFetch`, composants d'état partagés, `requireRole`).
3. Chaque écriture utilisateur passe par l'outbox IndexedDB existante (`src/lib/offline-sync.ts`).
4. Chaque module : états `chargement` / `erreur` / `vide` / `confirmation` / `toast` + fiche `PHASE-X.md`.

---

## Phases

### Phase 1 — Fondations UX (effort : 3-4 j)
**Objectif** : le feedback et le shell mobile existent partout, sans changer les écrans métier.
- Monter le `<Toaster>` de **sonner** dans `src/app/layout.tsx` (corrige P0-6 : 51 fichiers).
- Composants partagés : `<Skeleton>`, `<EmptyState>`, `<ErrorState>`, `<ConfirmDialog>`, `<OfflineBadge>`.
- Shell mobile : bottom nav (4 rôles) dans `page.tsx`/`app-layout.tsx`, cibles tactiles ≥ 44 px.
- Tables → cartes sous 768 px (commencer admin-dashboard, admin-users, admin-payments, teacher-classes).
- `next.config` : retirer `ignoreBuildErrors` si présent ; garder `tsc --noEmit` dans la vérification de fin de phase.
**Livré quand** : 0 débordement 360/390 px sur les écrans traités ; toast visible sur une action réelle ; bottom nav opérationnelle pour les 4 rôles.

### Phase 2 — Offline-first (effort : 3-5 j)
**Objectif** : aucune donnée saisie n'est perdue.
- Généraliser `queueOrFetch` aux écritures restantes (commencer : cahier-cotation, submissions de devoirs, encaissements, réactions/messages).
- Lectures : hydrater depuis IndexedDB avant le réseau (élève/parent : notes, devoirs, bulletins ; enseignant : classes, appel).
- UI : indicateur hors-ligne, file d'attente visible, retry automatique (flush existant `offline-sync.ts:56-105`).
**Livré quand** : mode avion → saisie note/devoir/message → reconnexion → sync confirmée + toast.

### Phase 3 — Élève & parent (effort : 3-4 j)
**Objectif** : les 2 rôles les plus utilisés sont complets.
- Corriger P0-9 : composant `student-payments` + import dans `page.tsx` (paiements via `api/payments` côté élève ; sinon masquer l'entrée de menu tant que l'API n'existe pas → **zéro bouton mort**).
- Devoirs : état « déjà rendu », filtre `classId` côté client **et** appel API correct.
- Corriger P0-8 : `api/parent-code` accepte `role=PARENT` (vérifier session parent existante).
- Citations/accueil dynamiques (`student-dashboard.tsx:28-34`) remplacées par données réelles ou retirées.
**Livré quand** : parcours élève complet sans écran vide ; parent peut régénérer son code.

### Phase 4 — Enseignant (effort : 4-5 j)
**Objectif** : le cahier de cotation et le quotidien du titulaire sont fluides.
- `cahier-cotation.tsx` : casser le monolithe en sous-vues (saisie TJ / interrogations / devoirs / examens), états vides/erreur, toasts, cibles tactiles.
- Dashboard : corriger N+1 (`teacher-dashboard.tsx:41-48`), afficher les erreurs (`:50-51`).
- Devoirs/présence : états de rendu et d'appel cohérents avec Phase 2.
- Classes : corriger classes Tailwind dynamiques (`teacher-classes.tsx:249-251`).
**Livré quand** : une semaine de saisie possible mobile sans perte ni écran cassé.

### Phase 5 — Admin (effort : 4-5 j)
**Objectif** : la direction voit des données justes.
- Devise : paramétrable USD/CDF (`admin-dashboard.tsx:249,260,647,723,751`) depuis la config école.
- Erreurs affichées (`:149,154`), fetch secondaires non silencieux (`admin-users.tsx:156-186`).
- Tables → cartes, pagination/chargement, confirmation sur actions destructives (suppression, publication).
- Validation notes + bulletins : états du cycle `DRAFT → VALIDATED_TITULAIRE → VALIDATED_ADMIN → PUBLISHED` visibles.
**Livré quand** : tableau de bord fiable en USD/CDF ; publication de bulletin avec confirmation et rollback.

### Phase 6 — Transverse connecté (effort : 3-4 j)
**Objectif** : les modules parlent entre eux.
- Messagerie : états de conversation vides/chargement, pièces jointes, notifications croisées.
- Meetings, bibliothèque, calendrier, profil, aide : mêmes composants d'état, toasts, responsive.
- Notifications : file d'attente offline, permission navigateur, badge unread cohérent entre rôles.
**Livré quand** : une notification part d'un rôle et s'affiche de l'autre, y compris hors-ligne (file).

### Phase 7 — Connexions métier manquantes (effort : 2-3 j)
**Objectif** : la chaîne cahier → Titulaire → Admin → publication est complète et traçable.
- Vérifier/brancher les appels orphelins repérés dans l'audit ; synchronisation automatique des rapports.
- Import CSV (élèves, parents, notes) — l'export existe, l'import est absent.
- Cohérence `ReportCard`/`Bulletin`/`ReportCounter` : une seule source de vérité côté types/UI.
**Livré quand** : note saisie par un enseignant → visible Titulaire → Admin → bulletin publié, sans action manuelle intermédiaire.

### Phase 8 — Qualité & accessibilité (effort : 2-3 j)
- a11y : focus visible, labels, navigation clavier sur les écrans critiques.
- Performance : supprimer N+1 résiduels, paralléliser les fetch, limiter le bundle (IA/messages chargés à la demande).
- Hydration React 19 (`/`, `/faq`, `/help`) : corriger le script de thème côté client.
- i18n FR minimal : regrouper les textes dans un module central (pas de refonte linguistique).

### Phase 9 — Sécurité serveur (effort : 3-4 j) — **en dernier, comme demandé**
- `requireRole(...)` centralisé dans `src/lib/auth/` ; appliquer aux 62 routes sans auth.
- Corriger P0 : escalade `users/[id]:111`, messagerie sans auth (7 routes), `debug/env`, `db-health` (reset hors query string), `fix-subscription` GET, IDOR `grades/[id]` et messages, filtre `schoolId` systématique.
- Secrets : jamais de préfixe/suffixe exposé côté client ; revue `NEXT_PUBLIC_*`.
- Tests : vérification manuelle 4 rôles + checklist dans `PHASE-9.md`.

---

## Chaînes critiques à ne jamais casser

| Chaîne | Points de contrôle |
|---|---|
| Cotation | enseignant saisit → `teacher-grades`/`cahier-cotation` → `api/grades` → titulaire voit → validation → admin → bulletin |
| Devoirs | enseignant crée (`classId` obligatoire) → élève voit **sa classe** → rendu → enseignant note → parent voit |
| Paiements | admin encaisse → élève/parent consulte → export |
| Messages | A envoie → B reçoit (notification) → lu → hors-ligne en file d'attente |

---

## Estimation globale

| Phase | Effort | Cumul |
|---|---|---|
| 1 Fondations UX | 3-4 j | 3-4 j |
| 2 Offline | 3-5 j | 6-9 j |
| 3 Élève & parent | 3-4 j | 9-13 j |
| 4 Enseignant | 4-5 j | 13-18 j |
| 5 Admin | 4-5 j | 17-23 j |
| 6 Transverse | 3-4 j | 20-27 j |
| 7 Connexions métier | 2-3 j | 22-30 j |
| 8 Qualité/a11y | 2-3 j | 24-33 j |
| 9 Sécurité | 3-4 j | **27-37 j** |

## Prochaine action
Lancer la **Phase 1** : monter le Toaster sonner + composants d'état partagés + bottom nav mobile, puis recette `360/390/768/1024/1440 × clair/sombre` avec `.zscripts/qa-shots.js`.
