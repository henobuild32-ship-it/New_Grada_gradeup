# Audit complet GradeUp — Phase 0

> État observé le 23 octobre 2026. Inventaire statique des routes, pages, composants, API, schéma Prisma, types et couches offline. Aucun code métier n’est modifié pendant cette phase. Les états UI/sécurité sont vérifiés par lecture du code ; ils ne sont pas réputés validés en production sans parcours avec une base joignable.

## Synthèse et baseline

| Mesure | État |
|---|---:|
| Routes API src/app/api/**/route.ts | 145 |
| Routes avec garde local authenticateRequest/requireAuth | 126 |
| Routes sans garde local explicite | 19, principalement routes publiques prévues, callbacks ou diagnostic neutralisé ; à justifier individuellement |
| Modèles Prisma | 62 |
| Composants gradeup | 82 |
| Primitives UI | 60 |
| Entrées de navigation cumulées tous rôles | 100 |
| npx tsc --noEmit | Réussi, 0 erreur |
| npm run lint | Réussi, 0 erreur |
| npm run build | Réussi, exit 0 après correction du script standalone ; avertissements Prisma 7 et middleware Next non bloquants |
| Base et API locale | PostgreSQL de développement isolé sur 127.0.0.1:5433 ; /api/health répond HTTP 200 |
| Seed / promotion | Seed appliqué ; 12 élèves et inscriptions, 22 notes ; contrôles de lisibilité des historiques, notes et évaluations réussis |
| npm run test:rbac | Réussi : 79/79 contrôles, dont scoping tenant, bulletins publiés, transition de publication, protection sync, notifications ciblées, accès paiements, horaires, cours/leçons/notes et listes utilisateurs bornées par rôle |

La navigation adaptative, les composants UI, Dexie/outbox, endpoints sync, RBAC partagé, moteur de cotation et workflow Bulletin sont déjà présents. Les phases précédentes avaient déclaré plusieurs de ces fondations livrées, mais l’audit constate qu’elles ne sont pas raccordées uniformément aux écrans et que les checklists complètes restent ouvertes. Le brief décrit quatre rôles ; le produit ajoute aussi CAISSIER, à inclure dans les droits et la QA. La base utilisée pour les contrôles runtime est une instance de développement locale, jamais la base distante ni la production.

## Matrice par rôle

Les états sont estimés depuis le code, pas certifiés par parcours runtime. L’infrastructure Dexie/outbox existe, mais la plupart des pages font encore des appels fetch directs et ne lisent pas par repository local réactif.

### ADMIN

| Module | Fichiers | Actions | API/données | Chargement/erreur/vide | Responsive | Offline | Problèmes / priorité |
|---|---|---|---|---|---|---|---|
| Dashboard | admin-dashboard.tsx, /api/stats, /api/payments | indicateurs, listes, exports | API réelle | partiel | tableaux à vérifier | snapshot non démontré | devises et actions à valider par école — P1 |
| Utilisateurs | admin-users.tsx, /api/users/** | CRUD, recherche, affectations, import/export selon écran | API réelle | partiel | formulaires/tableaux à vérifier à 360 px | écritures non mises en file | validations de création et isolation tenant — P0/P1 |
| Classes/titulaires | admin-classes.tsx, /api/classes/**, /api/users | CRUD, frais, affectations, transfert | API réelle | partiel | à vérifier | pas de lecture locale écran | droits d’affectation et tenant — P1 |
| Cours | admin-courses.tsx, /api/courses/**, /api/coefficients | CRUD, affectations | API réelle | partiel | à vérifier | non câblé localement | champs et droits par classe — P1 |
| Horaires | admin-schedules.tsx, /api/schedules/** | CRUD, duplication, créneaux | API réelle | partiel | grille mobile non validée | lectures élève/professeur local-first; API GET classe-scopée | conflits et publication — P1 |
| Calendrier/périodes | admin-school-calendar.tsx, /api/school-years, /api/periods, /api/academic-closures | années, périodes, fenêtres de saisie | API réelle | partiel | à vérifier | cache écran non prouvé | verrouillage métier à éprouver — P1 |
| Configuration école | admin-config.tsx, /api/config, /api/schools/[id] | identité, devise, paramètres | API réelle | partiel | formulaires larges à vérifier | non câblé | cohérence USD/CDF — P1 |
| Finances/frais | admin-payments.tsx, tuition-tracking.tsx, cashier-caisse.tsx, /api/payments/**, /api/fees/**, /api/tuition | encaissements, reçus, échéances | API réelle | partiel | formulaires/tableaux à vérifier | paiement online-only attendu ; brouillon offline non établi | reçu, solde parent et exports — P0/P1 |
| Cartes | admin-cards.tsx, /api/users/cards, /api/carte/** | génération, aperçu, impression | API réelle | partiel | impression mobile à tester | téléchargement offline non prouvé | QA PDF/planche — P2 |
| Cotation/coefficient | admin-cotation-rules.tsx, admin-coefficients.tsx, /api/grading-rules, /api/subject-rules, /api/coefficients | règles et coefficients | API réelle | partiel | tableaux à vérifier | non synchronisé à l’écran | systèmes de cotation à unifier — P1 |
| Validation/rectification notes | admin-grade-validation.tsx, admin-note-modifications.tsx, /api/grades/**, /api/note-modifications/** | valider, verrouiller, accepter/refuser | API réelle | partiel | à vérifier | écritures sous conditions | droits et notifications — P0/P1 |
| Bulletins/rapports | admin-reports.tsx, auto-report-sync-panel.tsx, /api/report-cards/**, Bulletin et bulletin-workflow.ts | générer, transmettre, publier, archiver | réel, principalement ReportCard | partiel | tableaux/PDF à vérifier | PDF/cache et online-only à valider | /api/bulletins absent ; second modèle/workflow non raccordé — P0 |
| Passages/fin d’année | admin-passages.tsx, end-of-year.tsx, /api/passages, /api/deliberation, /api/end-of-year | décisions, transferts, clôture | API réelle | partiel | confirmations mobiles à tester | clôture online-only attendue | sauvegarde, réversibilité, permissions — P0/P1 |
| Présences | admin-presence.tsx, presence-widget.tsx, /api/attendance/**, /api/presence/** | vue, filtres, pointage | API réelle | partiel | scan QR/GPS non testé sur appareil | sync partielle | sécurité et alertes — P1 |
| Notifications/IA | admin-notifications.tsx, admin-ai.tsx, services notifications, /api/notifications/**, /api/ai/** | annonces, préférences, assistant | API réelle | partiel | à vérifier | IA online-only, notifications offline non garanties | livraison, ciblage et quotas — P1 |
| Partagés | meetings/*, library/*, chat-page.tsx, school-calendar.tsx, profile-page.tsx, help-page.tsx, sync-center.tsx | réunions, ressources, messages, profil, aide, sync | API selon module | partiel | navigation responsive, pages à tester | couverture inégale | visibilité, pièces jointes, messages offline — P1 |

### TEACHER (dont Professeur Titulaire)

| Module | Fichiers | Actions | API/données | États | Responsive/offline | Problèmes / priorité |
|---|---|---|---|---|---|---|
| Dashboard | teacher-dashboard.tsx, /api/stats, /api/courses | cours, raccourcis, statistiques | réel | erreur partiellement avalée historiquement | mobile à vérifier ; cache absent | requêtes par classe et erreur — P1 |
| Cours/classes | teacher-courses.tsx, teacher-classes.tsx, /api/courses, /api/classes | consulter, fiches élèves | réel | partiel | styles dynamiques à vérifier ; pas de lecture Dexie | droits classe/titulaire — P1 |
| Leçons/documents | teacher-lessons.tsx, teacher-documents.tsx, /api/lessons/**, /api/documents | créer, publier, joindre fichiers | réel | partiel | éditeur mobile et brouillon local à valider | upload/publication — P1 |
| Devoirs/copies | teacher-homework.tsx, /api/homework/**, /api/submissions/** | créer, corriger, commenter | réel | état « déjà rendu » à vérifier | un chemin historique outbox ; mobile à tester | portée classe et workflow copie — P0/P1 |
| Présence | teacher-attendance.tsx, /api/attendance/** | appel, justification | réel | partiel | outbox historique seulement | sync reprise à éprouver — P1 |
| Notes/cahier | teacher-grades.tsx, cahier-cotation.tsx, /api/grades/**, /api/cahier/** | saisir TJ, envoyer, valider | réel | partiel | écran monolithique ; quelques appels outbox | maxima/périodes/workflow — P0/P1 |
| Bulletins titulaire | teacher-reports.tsx, auto-report-sync-panel.tsx, /api/report-cards/** | générer, transmettre | réel, modèle ancien | partiel | génération en ligne, mobile à valider | non branché à Bulletin ; droit titulaire strict — P0 |
| Horaires/notifications/IA | schedules-page.tsx, teacher-notifications.tsx, teacher-ai.tsx, /api/schedules/**, /api/notifications/**, /api/ai/** | lire, notifier, assister | réel | partiel | lecture offline et mobile à tester | états et canaux — P1 |
| Fin de cursus | end-of-year.tsx, /api/end-of-year, /api/passages | checklist, décisions | réel | partiel | online-only | droits titulaire à confirmer — P1 |
| Partagés | bibliothèque, meetings, chat, calendrier, profil, aide, sync-center | ressources, réunions, messages, profil | API selon module | partiel | couverture offline inégale | permission et notification — P1 |

### STUDENT

| Module | Fichiers | Actions | API/données | États | Responsive/offline | Problèmes / priorité |
|---|---|---|---|---|---|---|
| Dashboard | student-dashboard.tsx, /api/stats/**, /api/attendance/** | résumé, raccourcis | réel, contenus statiques ponctuels | partiel | read-through non garanti | fraîcheur à valider — P1 |
| Cours/leçons/horaires | student-courses.tsx, student-lessons.tsx, schedules-page.tsx, /api/courses, /api/lessons, /api/schedules | lire/télécharger | réel | partiel | lectures Dexie intégrées; affichage sur appareil encore à valider | pièces jointes et progression — P1 |
| Notes/bulletins | student-grades.tsx, student-bulletins.tsx, /api/grades, /api/report-cards | consulter, imprimer | ReportCard réel | partiel | tableaux/PDF/cache à tester | GET ne force pas published ; confusion modèle — P0 |
| Devoirs/copies | student-homework.tsx, /api/homework, /api/submissions | lire, déposer | réel | état déjà rendu à vérifier | soumission non reliée à lecture locale | droit classe, doublon et offline — P0 |
| Présence/paiements | student-attendance.tsx, student-payments.tsx, /api/attendance, /api/payments | consulter | API réelle | paiement élève désormais routé, états et devise multi-devise affichés | cartes mobiles + table desktop | calcul des retards désormais en lecture seule; lecture paiements limitée au rôle — à revalider sur écrans authentifiés |
| IA/notifications | student-ai.tsx, student-notifications.tsx, /api/ai/**, /api/notifications/** | chat, lire, marquer lu | réel | partiel | IA online-only ; historique local limité | scope, quotas et notifications — P1 |
| Partagés | library, meetings, chat, calendrier, profil, aide, sync-center | ressources, réunions, messages, etc. | API selon module | partiel | navigation mobile présente, QA nécessaire | accès/attachments/cache — P1 |

### PARENT

| Module | Fichiers | Actions | API/données | États | Responsive/offline | Problèmes / priorité |
|---|---|---|---|---|---|---|
| Dashboard multi-enfant | parent-dashboard.tsx, /api/parent/children, /api/stats/** | sélectionner et consulter | réel | partiel | cache réactif non garanti | enfant actif/agrégation — P1 |
| Notes/bulletins | parent-grades.tsx, parent-bulletins.tsx, /api/grades, /api/report-cards | lire, imprimer/partager | ReportCard réel | partiel | tableaux/PDF/cache à tester | parentId et statut publié doivent être imposés serveur — P0 |
| Paiements | parent-payments.tsx, /api/payments/**, /api/fees/** | solde, reçus, paiement | réel | partiel | lecture parent locale intégrée; paiement online-only et lecture appareil à valider | reçus, solde par enfant, devise — P0/P1 |
| Présence/justifications | parent-dashboard.tsx (onglet Absences/Présence), parent-presence.tsx, /api/absence-justifications/**, /api/attendance/** | consulter, justifier | API présente | accessible depuis le tableau de bord ; offline non établi | panneau parent présent, route dédiée absente | vérifier isolation enfant et revoir l’exposition de la géolocalisation précise — P0/P1 |
| IA/notifications | parent-ai.tsx, parent-notifications.tsx, /api/ai/**, /api/notifications/** | chat, lire | réel | partiel | IA online-only, sync partielle | isolation multi-enfant/canaux — P1 |
| Partagés | library, meetings, chat, profil, aide, sync-center | utiliser modules communs | API selon module | partiel | non testé | règles de communication et accès — P1 |

### CAISSIER (rôle additionnel)

| Module | Fichiers | Actions | API/données | États/mobile/offline | Problèmes / priorité |
|---|---|---|---|---|---|
| Caisse | cashier-caisse.tsx, /api/payments/**, /api/fees/** | saisir versement, consulter caisse | réel | partiel, mobile/offline à tester ; paiement sensible online-only attendu | rôle absent du brief, séparer et tester ses droits — P0/P1 |
| Profil/aide | profile-page.tsx, help-page.tsx | profil, aide | partagé | à vérifier | droits caissier — P1 |

## Modules transversaux

| Module | Fichiers | Actions/API | États/mobile | Offline | Écart / priorité |
|---|---|---|---|---|---|
| Navigation | app-layout.tsx, navigation.config.ts, page.tsx | routes par rôle, bottom nav | adaptative et safe-area présentes ; pages non toutes testées | — | pages orphelines/doublons ; UI n’est pas RBAC serveur — P1 |
| Design system | components/ui/*, ui-states.tsx, toasters | boutons, champs, tabs, états, toasts | primitives présentes, adoption inégale | — | cibles/contrastes et chaque écran à auditer — P1 |
| PWA/cache | manifest.ts, sw.ts, offline/page.tsx, managers install/update | shell, API, fichiers | infrastructure documentée | cache navigateur, sans garantir Dexie local-first | installation réelle/quotas à tester — P1 |
| Offline/sync | lib/offline/*, lib/sync/*, offline-sync.ts | tables, repository, push/pull, conflit | centre de sync présent | infrastructure existe mais peu branchée | lecture locale et mutations idempotentes non universelles — P0/P1 |
| Messagerie | chat-page.tsx, message-center.tsx, /api/messages/**, /api/conversations/** | messages, recherche, réactions | réel, états partiels | ancien composant utilise outbox | deux composants, scopes et chat offline à valider — P0 |
| Bibliothèque/fichiers | library-hub.tsx, /api/resources/**, /api/resources/upload | upload, publier, favoris | API réelle | téléchargement local partiel | visibilité et bouton publication à parcourir — P1 |
| Notifications/realtime | src/services/notifications/*, /api/notifications/**, Supabase | in-app, push/SSE, préférences | infrastructure présente | queue UI non garantie | delivery/retry et flux inter-rôles — P1 |
| Calendrier/visio | school-calendar.tsx, meetings/*, /api/calendar, /api/meetings | événements, salles, participants | API présente | portrait/3G/offline non testé | fournisseur visio et appareils — P2 |
| Profil/aide | profile-page.tsx, help-page.tsx, FAQ, /api/users/[id] | profil, aide | réel/statique selon vue | purge session à vérifier | gestion sessions et données offline — P1 |

## Actions et données inactives/incomplètes

- student-payments et teacher-lessons sont désormais présents dans le menu du rôle et raccordés à leur composant dédié.
- Depuis la reprise, les lectures student-payments, student-bulletins, student-attendance, student-courses, student-lessons, student-grades, student/teacher schedules, parent-grades, parent-payments et parent-bulletins utilisent le repository local avec filtres de portée; les autres écrans restent à migrer vers les hooks offline.
- admin-coefficients est désormais dans le menu ADMIN ; les maquettes marketing du tableau de bord, du cahier, du bulletin, de la caisse et de Gradie n’affichent plus d’identifiants ni de résultats présentés comme des données d’école.
- parent-presence est rendu dans l’onglet Présence du tableau de bord parent ; il n’existe pas comme entrée de navigation distincte.
- admin-conferences sert à planifier une réunion et meetings reste le hub des visioconférences ; les intitulés du menu les distinguent.
- Toutes les actions des 82 composants n’ont pas été validées individuellement ; les états non parcourus restent à vérifier.
- Le scan ciblé n’a pas trouvé de compte DEMO_USERS/MOCK_USERS ou mockData d’authentification dans src. « Demander une démo » est un CTA marketing ; prisma/seed.js est un jeu de données de développement, à isoler de la production.
- Les contenus d’exemple, textes codés en dur et statistiques doivent rester distingués des vraies données métier.

## API manquantes ou incomplètes

- Aucun src/app/api/bulletins/**/route.ts : les pages/API utilisent ReportCard et /api/report-cards, tandis que Bulletin et applyBulletinTransition() constituent un second circuit. Aucun PDF d’API pour ce workflow.
- Le module parent utilise le composant présence dans le tableau de bord ; les routes de justification doivent encore être vérifiées de bout en bout.
- /api/lessons existe ; MDX, pièces jointes, publication et visibilité élève doivent être vérifiés ensemble.
- /api/resources et /api/resources/upload existent ; publier, validation et stockage doivent être parcourus.
- /api/sync/push et /api/sync/pull existent, mais ne remplacent pas l’usage des repositories dans les vues.
- Les conventions d’erreur, pagination et filtres ne sont pas uniformes dans toutes les routes.
## Incohérences Prisma / types / interface

- Bulletin et ReportCard coexistent : Bulletin a un enum de statuts et le workflow de double validation ; ReportCard utilise des statuts texte et alimente les vues actuelles. term entier et trimester chaîne coexistent.
- User.role est String en base ; TypeScript déclare UserRole et le produit ajoute CAISSIER.
- NoteModification et PassageHistorique peuvent correspondre à GradeModificationRequest et Passage mais équivalence des champs à confirmer.
- Noms différents : birthDate/dateOfBirth, active/isActive, content/contentMdx, term/trimester/period.
- Les 62 modèles ne semblent pas tous avoir l’enveloppe schoolId/version/deletedAt attendue pour la synchronisation.
- Des modèles attendus existent au moins sous un nom proche : SchoolYear, Homework, Submission, Grade, GradeSnapshot, Bulletin, Attendance, AbsenceJustification, Payment, Fee/Installment, Message, Event, Ressource, CourseSchedule, Notification, AuditLog, PassageHistorique. Le nom ne prouve pas la parité fonctionnelle.

## Sécurité

| Constat statique | Fichier | Priorité |
|---|---|---|
| [Corrigé 2026-10-23] POST /api/parent-code exige ADMIN et cible désormais un élève actif du même schoolId ; code généré avec crypto et collision unique retentée | src/app/api/parent-code/route.ts | Régression |
| Un cookie vérifié au middleware ne prouve pas que chaque route contrôle rôle, tenant et propriété de la ressource | src/middleware.ts et routes API | P0 |
| [Corrigé 2026-10-23] GET /api/report-cards force published côté serveur pour STUDENT/PARENT, limite les classes TEACHER et rejette les rôles non autorisés | src/app/api/report-cards/route.ts | Régression |
| [Partiellement corrigé 2026-10-23] ReportCard impose désormais les transitions brouillon→transmis→validé par ADMIN→publié avec mise à jour conditionnelle ; le modèle Bulletin et /api/bulletins restent séparés et non raccordés | src/app/api/report-cards/route.ts, src/lib/business/bulletin-workflow.ts | P0 ouvert — unification requise |
| Autorisations détaillées de chaque mutation sync doivent être exercées avec les rôles | src/app/api/sync/push/route.ts, src/app/api/sync/pull/route.ts | P0/P1 |
| 19 fichiers API n’ont pas de garde local ; la plupart sont endpoints publics prévus, callbacks ou diagnostic neutralisé, à maintenir avec justification et test | middleware.ts et routes listées par scan | P1 |

Risques historiques qui semblent corrigés, à garder en régression :
- /api/debug/env renvoie 404 sans exposer les secrets.
- /api/admin/db-health exige ADMIN et un secret d’opérations dans un header ; l’ancien secret en query est supprimé.
- /api/users/[id] réserve les changements de rôle à ADMIN, d’après PHASE-3.md.

## Plan priorisé

1. P0 : conserver les contrôles corrigés de parent-code et report-cards en régression, puis unifier Bulletin/ReportCard et câbler le workflow canonique aux écrans.
2. Fondations : vérifier les routes de pages, supprimer ou connecter les pages mortes, validation des formulaires, états et layouts à 360–400 px.
3. Offline intégré : brancher les pages aux repositories/outbox, protéger les opérations online-only et vérifier reprise, idempotence et conflits.
4. Compléter les modules ADMIN A–D, TEACHER A/B, STUDENT, PARENT et CAISSIER additionnel.
5. Finaliser les transversaux et scénarios inter-rôles : bibliothèque, messages, calendrier, profils, notifications et sync.
6. QA : RBAC sur serveur/base, tests mobile 360/390/768/1280 px, mode avion, accessibilité, performance, build/lint/typecheck.

Les PHASE-1 à PHASE-3 existantes forment une base, mais les écarts ci-dessus ne permettent pas de considérer leurs checklists détaillées comme toutes vertes.

## Checklist Phase 0

- [x] Modules ADMIN, TEACHER, STUDENT, PARENT et CAISSIER inventoriés.
- [x] Transversaux et systèmes techniques répertoriés.
- [x] Actions/pages non raccordées et inconnues explicitement distinguées.
- [x] Données statiques, API manquantes, écarts de schéma/types et sécurité documentés.
- [x] Priorités et plan ordonné définis.
- [x] TypeScript et lint vérifiés.
- [x] Build final réussi après correction du helper standalone (aucun code métier modifié).
- [x] Test RBAC exécuté sur serveur et base locale isolée : 79/79 après correctifs de synchronisation, notifications, portée des paiements, horaires et limites de cours, leçons et notes.
- [x] Aucun code métier modifié pendant l’audit.
