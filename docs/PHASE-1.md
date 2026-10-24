# PHASE 1 — Fondations mobile-first

> Date : 2026-10-15, reprise : 2026-10-23 · État : en cours. Règles : mobile-first 360–400 px, cibles ≥ 44 px, navigation adaptative, tables→cartes < 768 px, zéro scroll horizontal, formulaires validés, français, clair/sombre.

## Objectif
Refondre les fondations UI de GradeUp sans changer la logique métier : design system partagé, navigation unique pour 4 rôles adaptative (mobile / tablette / desktop), tables converties en cartes sous 768 px, formulaires zod + react-hook-form, états standard, i18n prête.

## 1. Toasts sonner effectivement montés (P0-6 corrigé)
- `src/app/layout.tsx` : import + rendu de `<SonnerToaster />` à côté du Toaster shadcn (conservé : 6 fichiers utilisent encore `use-toast`).
- Vérifié en navigateur : `<section aria-label="Notifications alt+T" aria-live="polite">` présent dans le DOM.
- Impact : les **51 fichiers** qui appellent `toast()` de sonner affichent désormais leurs confirmations/erreurs.

## 2. Design system — `src/components/ui/` (nouveaux)
| Composant | Rôle |
|---|---|
| `bottom-sheet.tsx` | BottomSheet mobile (vaul), réutilisé pour le tiroir « Plus » et les filtres |
| `icon-button.tsx` | IconButton, `aria-label` requis, min 44×44 px |
| `fab.tsx` | Bouton flottant d'action principale (mobile) |
| `page-header.tsx` | En-tête de page standard (titre, aide, action) |
| `search-bar.tsx` | Barre de recherche + filtres en bottom sheet |
| `status-badge.tsx` | Badge statut + teintes `paymentStatusTone` / `presenceStatusTone` |
| `date-picker.tsx` | Popover + Calendar (date-fns `fr`), émet `yyyy-MM-dd` |
| `card-list.tsx` | `CardList<T>` / `CardListRow` : liste cartes générique |
| `empty-state.tsx` / `error-state.tsx` | États vide / erreur / bandeau erreur + Réessayer |
| `scrollable-tabs.tsx` | Onglets à défilement horizontal |
| `form-field.tsx` | Label toujours visible, erreur `role="alert"`, `inputMode` inféré (numeric/tel/email), input ≥ 16 px |

- `src/components/gradeup/ui-states.tsx` : **shim de compat** — réexporte `ErrorBanner`/`ErrorState` du design system, garde l'API historique `EmptyState` (actionLabel/onAction), `LoadingRows`, `NoSearchResults`. Aucun important existant cassé.

## 3. Navigation unique — `src/lib/navigation.config.ts` (nouveau)
- Source unique : `NAV_ITEMS_BY_ROLE` (menus complets 4 rôles), `PRIMARY_TABS_BY_ROLE` (4 onglets/role), `PAGE_TITLES`, `PAGE_HELP`, `ROLE_LABELS`, `ROLE_BADGE_COLORS`, helpers `getNavItems` / `getPrimaryTabs` / `getMoreItems` / `isMoreItemActive`.
- Filtrage TEACHER non-titulaire sur `teacher-reports` + `auto-report-sync` conservé.
- `app-layout.tsx` : les blocs locaux dupliqués (navItems, labels, couleurs, titres) ont été supprimés au profit de ce module.

## 4. Layout adaptatif 3 paliers — `src/components/gradeup/app-layout.tsx`
| Palier | Comportement |
|---|---|
| **Mobile < 768 px** | Top bar compacte (logo, titre de page, cloche notifications avec badge, menu avatar profil/déconnexion) + **bottom nav = 4 onglets primaires + emplacement « Plus »** (`aria-current`, `aria-haspopup="dialog"`) + **tiroir `<BottomSheet>`** « Plus de modules » (grille 3 colonnes + Déconnexion). Cibles ≥ 44 px, safe-area `env(safe-area-inset-bottom)`. Swipe horizontal sur les onglets primaires avec garde si pas d'utilisateur. |
| **Tablette 768–1023 px** | Sidebar repliable (`md:flex`), bottom nav masquée |
| **Desktop ≥ 1024 px** | Sidebar complète, toggle de réduction dans le header |

- Bottom nav primaire : ADMIN [Accueil, Classes, Paiements, Profil], TEACHER [Accueil, Notes, Devoirs, Profil], STUDENT [Accueil, Notes, Devoirs, Profil], PARENT [Accueil, Suivi, Paiements, Profil].
- `src/app/layout.tsx` : viewport corrigé — `width: "device-width"`, `initialScale: 1`, `maximumScale: 1`, `viewportFit: "cover"`.
- La palette de commandes lit désormais exactement la navigation partagée (y compris les filtres titulaire), au lieu de maintenir une seconde liste de rôles.
- L’écran CAISSIER possède une boîte de réception dédiée ; la cloche utilise une route typée par rôle et le GET serveur limite les lignes visibles aux notifications personnelles, CAISSIER et ALL. L’ADMIN peut cibler explicitement l’équipe de caisse. La sélection d'une autre interface a été retirée du menu profil, car elle ne changeait pas la session et envoyait vers une page refusée.
- Les cibles du shell tablette ont une taille minimale de 44 px. La barre supérieure ajoute la zone de sécurité au-dessus de ses 56 px au lieu de réduire la zone des commandes sur les appareils avec encoche.

## 5. Tables → cartes sous 768 px
Double rendu systématique (`hidden md:block` pour le tableau desktop inchangé, `md:hidden` pour les cartes) :
| Fichier | Contenu converti |
|---|---|
| `admin-users.tsx` | Carte par utilisateur (avatar, badge rôle, bascule Actif, actions ≥ 44 px) |
| `admin-payments.tsx` | Carte par paiement (montant, statut, méthode, menu Actions) |
| `teacher-attendance.tsx` | Historique de présence |
| `admin-conferences.tsx` | Visioconférences (Rejoindre/Supprimer) |
| `parent-grades.tsx` | Onglet détails des notes (+ rangée moyenne mobile) |
| `student-grades.tsx` | Notes par cours (moyenne, barre, badges, « Signaler ») |
| `parent-dashboard.tsx` | Onglet Notes (carte par note : cours, note/max, commentaire) |
| `admin-cotation-rules.tsx` | Éditeur de règles : une carte par cours (inputs numeriques + switch, labels) |
| `auto-report-sync-panel.tsx` | Carte par bulletin (checkbox, moyenne, mention, statut, Voir/Transmettre) |

Déjà responsives sans travail : `parent-payments`, `teacher-reports` (cards), `teacher-grades` (cartes existantes L911/L1064), `admin-dashboard`, `teacher-classes`.

**Exceptions assumées (document format, pas listes de données)** :
- `admin-reports.tsx` : tableau `bulletin-table` = éditeur/impression du bulletin RDC (rowSpan/colSpan, mise en page papier) — conversion卡片 détruirait le format ; scroll horizontal contenu assumé, reprise Phase 4.
- `cahier-cotation.tsx` : grille matricielle élèves × évaluations (éditeur + print) — scroll horizontal assumé (équivalent tableau papier), reprise Phase 4.
- `bulletin-print.tsx` : vue d'impression.

## 6. Formulaires zod + react-hook-form (exemplaire)
- `src/lib/forms/schemas.ts` : schémas partagés FR — `emailSchema`, `passwordSchema` (≥ 8), `nameSchema`, `phoneSchema` RDC, `amountSchema`, `isoDateSchema`, `loginSchema`, `createUserSchema`, **`adminUserSchema` + `buildAdminUserSchema(isEdit)`** avec `superRefine` (date de naissance requise STUDENT/TEACHER, spécialité + téléphone requis TEACHER, mot de passe requis à la création seul).
- **`admin-users.tsx` dialog création/édition converti** : `useForm<AdminUserFormValues>` + resolver dynamique selon mode création/édition, champs via `FormField` (erreurs inline `role="alert"`), Select rôle / RadioGroup sexe / cases titulaire contrôlés (`watch` + `setValue`), bouton submit dans un `<form onSubmit>` avec **footer collant en bas sur mobile** (`sticky bottom-0`), cibles ≥ 44 px.
- Pattern à répliquer dans les phases suivantes.

## 7. i18n prête
- `src/lib/i18n/fr.ts` : textes partagés + helper `t()` (fr par défaut, centralisé).

## 8. Config build
- `next.config.ts` : `typescript.ignoreBuildErrors` supprimé (Phase 0/1) — le build échoue sur toute erreur de type.

## Vérifications effectuées pendant la reprise — 2026-10-23
- [x] npx tsc --noEmit → exit 0.
- [x] npm run lint → exit 0.
- [x] npm run build → exit 0 ; Prisma signale sa configuration package.json dépréciée et Next sa convention middleware dépréciée (avertissements non bloquants).
- [x] Navigateur intégré, origine propre : page d’accueil testée à 360×640, 390×844, 768×1024 et 1280×800, sans débordement horizontal.
- [x] Connexion et inscription testées aux mêmes tailles : aucun débordement ; champs texte/date/téléphone de 16 px et 44 px de haut ; le sexe reste non sélectionné par défaut ; les champs requis enseignant apparaissent.
- [x] Maquette marketing du tableau de bord contrôlée : aucun effectif, nom d’élève, note ou pourcentage fictif.
- [x] Sur une origine navigateur propre, aucun avertissement ni erreur console après hydratation. L’enregistrement du service worker est désormais fait par un composant client après hydratation.
- [ ] Les écrans authentifiés (navigation, classes, paiements, tables par rôle) restent à vérifier en UI. `/api/health` a répondu HTTP 200 avec une base PostgreSQL de développement isolée sous le serveur dev; le serveur standalone lancé sans `.env.local` a utilisé la base distante configurée dans `.env`, inaccessible depuis ce poste.
- [ ] Le navigateur intégré signale encore « Local browser use is disabled in Work settings » après activation annoncée par l’utilisateur. Le script CDP sans dépendance externe s’arrête aussi avec un crash GPU (2147483651) avant la recette des rôles.
- [x] Test d'autorisations backend relancé contre le serveur et le seed locaux : 79/79 contrôles, incluant génération, transmission/validation/publication protégées, filtres de notifications, visibilité publiée élève/parent, horaires, cours, leçons, notes et listes utilisateurs bornés par rôle.
- [ ] Contrôle UI après l'ajout de la boîte de réception CAISSIER impossible tant que le navigateur local reste désactivé dans Work ; l'écran compile et la portée serveur est couverte par le lint/typecheck/build, pas encore par un parcours connecté CAISSIER.

## Checklist restante
- [ ] Refaire le shell authentifié pour les quatre rôles sur 360×640, 390×844, 768×1024 et 1280×800.
- [ ] Parcourir toutes les pages pour contrôler les cartes mobiles, le scroll horizontal, les états et les boutons actifs.
- [ ] Migrer les formulaires encore contrôlés par état vers zod + react-hook-form, avec erreurs inline et action collante mobile.
- [ ] Contrôler mode avion, contraste AA, navigation clavier et annonce VoiceOver/TalkBack (cache complet en Phase 2).

## Mise à jour du backend local — 2026-10-23

- PostgreSQL de développement isolé prêt sur `127.0.0.1:5433`; le schéma Prisma et le seed sont chargés. Cette base n’est ni la base distante ni la production.
- Les formulaires et le shell authentifié ne sont pas encore validés par parcours manuel multi-rôle. Le navigateur intégré est désactivé côté Work et Chrome headless échoue avant le parcours.
- Le test backend crée un bulletin de test à partir des notes seedées; il confirme le refus de publication directe avant validation.
## Fichiers modifiés / créés
**Créés** : `src/lib/navigation.config.ts`, `src/lib/i18n/fr.ts`, `src/lib/forms/schemas.ts`, `src/components/ui/{bottom-sheet,icon-button,fab,page-header,search-bar,status-badge,date-picker,card-list,empty-state,error-state,scrollable-tabs,form-field}.tsx`, `src/components/gradeup/cashier-notifications.tsx`, `.zscripts/qa-phase1.js`
**Modifiés** : `src/app/layout.tsx` (viewport + SonnerToaster), `src/app/page.tsx` (route notifications caissier), `src/components/gradeup/app-layout.tsx` (3 paliers + navigation.config + BottomSheet + commandes ≥44 px), `src/components/gradeup/command-palette.tsx` (source de navigation unique), `src/components/gradeup/parent-notifications.tsx` (boîte partagée parent/caissier), `src/components/gradeup/admin-notifications.tsx` (ciblage de la caisse), `src/components/gradeup/admin-schedules.tsx` (annonce de classe), `src/services/notifications/notificationListener.ts` (SSE authentifié), `src/components/gradeup/ui-states.tsx` (shim), `src/components/gradeup/admin-dashboard.tsx`, `admin-users.tsx` (cartes + formulaire RHF/zod), `admin-payments.tsx`, `admin-conferences.tsx`, `admin-cotation-rules.tsx`, `auto-report-sync-panel.tsx`, `parent-dashboard.tsx`, `parent-grades.tsx`, `student-grades.tsx`, `teacher-attendance.tsx`, `src/lib/types.ts`, `src/lib/navigation.config.ts`, `src/app/api/notifications/route.ts`, `src/app/api/notifications/stream/route.ts`, `scripts/rbac-check.mjs`, `docs/API.md`, `docs/PHASE-3.md`, `next.config.ts`
**Docs** : `docs/AUDIT.md`, `docs/PLAN.md`, `docs/PHASE-1.md` (ce document)

## Suite (Phase 2)
- Offline-first : lecture IndexedDB généralisée + file d'attente `queueOrFetch` sur toutes les écritures.
- Formulaires RHF/zod répliqués : paiements, conférences, devoirs, notes, comptes parent.
- États standard (skeleton / erreur+Réessayer / vide+action) généralisés à tous les modules encore dupliquant le motif.
