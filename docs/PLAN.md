# Plan d’exécution GradeUp — Phases 0 à 10

> Source de vérité : la demande de travail fournie par l’utilisateur, avec les contraintes complémentaires du dépôt Agent.md. Ordre strict : une phase est validée avant de commencer la suivante. Chaque livrable décrit les changements, les limites et les éléments restant incomplets. Estimations indicatives en jours-personne, à réviser si le code ou les services externes imposent des changements.

## État initial

- Phase 0 : terminée. AUDIT.md, PLAN.md et PHASE-0.md sont renseignés. TypeScript, lint, build et 79/79 contrôles RBAC passent sur une base locale de développement isolée; le parcours de promotion est lisible. La base distante n’a pas été utilisée.
- Phase 1 : en cours. Navigation, Paiements élève, résumé multi-devise et valeurs fictives du tableau marketing corrigés ; accueil, connexion et inscription contrôlés à quatre dimensions. Restent les shells authentifiés, l’audit page par page et plusieurs formulaires.
- Phase 2 : manifest, service worker, Dexie, outbox et API sync sont présents. Correctifs de sécurité du push/pull et des lectures appliqués; sept lectures élève, « Mes cours » et les horaires professeur, et les lectures parent des notes, paiements et bulletins utilisent maintenant Dexie. Le raccordement des autres modules, la pagination delta et le scénario mutation authentifiée restent ouverts.
- Phase 3 : socle présent, phase non clôturée. Correctifs P0 partiels pour parent-code et ReportCard; l’unification Bulletin/ReportCard, le câblage du workflow canonique et l’audit de toutes les routes restent à faire. Ces correctifs ont été appliqués en réponse à des risques P0 relevés pendant l’audit, sans déclarer les phases intermédiaires achevées.
- Phase 4 : l'utilisateur a demandé explicitement son exécution avant la fermeture des gates 1–3. Des correctifs ciblés sont en cours; 4A–4D restent partiellement réalisées et leurs écarts sont détaillés dans les livrables correspondants.
- Phases 5 à 10 : l'utilisateur a demandé la poursuite de tout le périmètre. Les livrables 5A–10 sont maintenant amorcés et leurs écarts, validations manuelles et limites sont consignés; les gates d'exécution et de recette ne sont pas fermées.
- Contraintes transversales du dépôt : aucun compte utilisateur de démonstration, aucun pourcentage inventé, champs d’identité validés côté serveur, aucun bouton mort. Le seed de développement réaliste n’est pas un compte d’accès et ne doit pas être exposé à l’authentification.

## Phases

| Phase | Périmètre | Effort indicatif | État |
|---|---|---:|---|
| 0 | Audit complet, cartographie, plan | 0,5–1 j | Terminée ; typecheck, lint, build, seed local isolé, /api/health 200, RBAC 79/79 |
| 1 | Design system, layout mobile, navigation, formulaires, états | 3–5 j | En cours ; QA publique à 4 dimensions, shells authentifiés, audit page par page et formulaires restant |
| 2 | PWA, Dexie, repositories, outbox, conflits, centre sync, intégration des écrans offline | 5–8 j | En cours ; lectures élève et professeur et trois lectures parent intégrées, autres modules et test authentifié hors ligne incomplets |
| 3 | Schéma/API/RBAC/validation, modèles, notifications, stockage, sync | 6–10 j | P0 partiellement corrigés et testés ; unification du bulletin et revue complète des routes restent ouvertes |
| 4A | Admin : dashboard, utilisateurs, classes, cours, horaires, calendrier, config | 4–6 j | Partielle ; stats et valeurs métier renforcées, glisser-déposer ordinateur ajouté, recette mobile restante |
| 4B | Admin : paiements, frais, reçus et cartes | 3–5 j | En cours ; devises/tranches/reçus/solde corrigés, carte PDF et recettes restantes |
| 4C | Admin : cotation, validation notes, bulletins, passages, clôture annuelle | 5–8 j | En cours ; flux Bulletin canonique exposé, migration historique et tests règles/clôture restants |
| 4D | Admin : présences, notifications, IA | 3–5 j | Partielle ; scan QR, GPS, annonces ciblées, signaux réels et cache/rate limit IA présents; canaux planifiés et recette device restants |
| 5A | Professeur : dashboard, cours, leçons, documents, devoirs, présence, horaires, notifications | 4–6 j | Partielle ; brouillon local/aperçu Markdown et publication leçon en ligne raccordés; recette offline/E2E restante |
| 5B | Professeur : notes RDC, rectifications, bulletins titulaire, fin de cursus, IA | 4–7 j | Partielle ; titulaire raccordé au Bulletin canonique, tests unitaires moyenne/sync ajoutés |
| 6 | Élève : cours, leçons, devoirs, notes, bulletin, présence, horaires, IA, notifications | 4–6 j | Partielle ; écrans, sync lectures et bulletin publié canonique présents; parcours mobile/ownership à exécuter |
| 7 | Parent : enfants, notes, bulletins PDF, paiements, présence/justifications, IA, notifications | 4–6 j | Partielle ; enfants persistés, solde multi-devise, PDF/cache, filtres multi-enfants corrigés |
| 8 | Transversaux : visioconférence, bibliothèque, messagerie, calendrier, profil et aide | 5–8 j | Partielle ; interfaces/APIs présentes et scopes CLASS/calendrier renforcés; media/offline à tester |
| 9 | Workflows de bout en bout inter-rôles et hors ligne | 4–7 j | Non validée ; matrice de parcours documentée; E2E Playwright/DB/device non disponibles |
| 10 | Performance, accessibilité, sécurité finale, QA, docs | 5–8 j | Partielle ; contrôles statiques/tests unitaires/docs livrés; Lighthouse, Android réel et revue sécurité totale ouverts |

## Ordre détaillé et critères de sortie

### Phase 0 — Audit

Livrables : AUDIT.md et PLAN.md. L’inventaire couvre chaque rôle, les modules transversaux, API, données, états, mobile, offline, incohérences et sécurité. La phase ne modifie pas le code métier.

### Phase 1 — Fondations mobile-first

Compléter les fondations présentes sans casser le métier : navigation unique par rôle, top bar + bottom nav + menu Plus, vues 360–400 px et 768/1280 px, états standardisés, thème clair/sombre, cibles tactiles, formulaires zod/react-hook-form et langues centralisées. Réutiliser le design system actuel. Valider l’accès aux écrans et les pages orphelines. Aucun pourcentage de tendance inventé et aucun compte de démonstration.

### Phase 2 — Offline-first

Compléter PWA et cache; brancher la lecture locale et les écritures à Dexie/repositories/outbox; sécuriser l’idempotence, retries et conflits; distinguer explicitement les opérations online-only (paiements, publication bulletin, clôture, suppression et rôles). Tester la persistance au redémarrage, la coupure en cours d’envoi et la reconnexion.

### Phase 3 — Backend, données et sécurité

Revoir chaque modèle et route; compléter migrations/seed réaliste de développement, endpoints et validation partagée. Appliquer RBAC, tenant et ownership serveur. Consigner les endpoints par rôle dans API.md. Utiliser une seule source canonique pour les bulletins : DRAFT → VALIDATED_TITULAIRE → VALIDATED_ADMIN → PUBLISHED, avec PDF, audit et notifications. Les données d’inscription imposent le sexe M/F; date de naissance pour élève/professeur; classe et matricule serveur pour élève; spécialité et téléphone pour professeur. La modification de rôle et l’opération financière sont protégées.

### Phase 4 — ADMIN

- 4A : tableau de bord alimenté par vraies stats, utilisateurs (y compris import avec aperçu/erreurs), classes et titulaires, cours, conflits/horaires, année/périodes/verrouillage et config école.
- 4B : paiements multi-devise, numéro de reçu serveur, correction auditée, échéances/solde parent, exports et cartes scolaires PDF en mode mobile léger.
- 4C : règles RDC et moyennes pondérées, verrouillage/rectification de notes, double validation/publishing/PDF bulletin, délibérations et clôture avec prérequis.
- 4D : pointage QR/GPS, annonces ciblées, préférences/canaux/retry et IA basée sur données réelles.

### Phase 5 — PROFESSEUR

- 5A : tâches quotidiennes, leçons MDX avec brouillon local et publication réellement visible, documents, devoirs et corrections, présence hors ligne, horaires.
- 5B : cahier RDC TJ/interros/devoirs/examens, maxima/configuration, modifications de notes, génération et validation titulaire de bulletins, avis de fin de cursus et assistance IA en ligne.
- Toute action visible donne un état de chargement, résultat, erreur, état vide ou confirmation selon le cas.

### Phase 6 — ÉLÈVE

Dashboard léger, contenus et horaires hors ligne, notes et bulletins publiés uniquement, PDF local, copies/devoirs en outbox avec statut, présence, notifications et IA en ligne. Les endpoints ne renvoient jamais les données d’un autre élève.

### Phase 7 — PARENT

Sélection multi-enfant persistée, notes/bulletins publiés, PDF officiel et partage, soldes/reçus, calendrier de frais, justificatifs d’absence préparés offline, décisions/notifications et assistant en ligne. Chaque route parent vérifie le lien parentCode/parentId côté serveur.

### Phase 8 — Transversaux

Terminer les salles de réunion, ressources PUBLIC/SCHOOL/CLASS/PRIVATE, messagerie avec envoi offline, calendrier, profil (sessions et nettoyage local), centre d’aide. Vérifier rôle, tenant, pièce jointe et état réseau sur chaque action.

### Phase 9 — Workflows intégrés

Exécuter les 8 scénarios du prompt : rentrée/horaires; publication leçon/devoir/copie/correction; présence et justification; notes et rectification; double validation bulletin; paiement et reçu; délibération/clôture; coupure réseau au milieu. Documenter les écrans, résultats et KO dans PHASE-9.md. Aucun scénario n’est vert sans données liées et contrôles de permissions.

### Phase 10 — QA finale

Vérifier performance mobile/3G, accessibilité clavier/lecteur d’écran, sécurité complète, error boundaries, migrations/cache, boutons sans action, guides, README et DOCUMENTATION.md. Produire QA-FINAL.md avec matrice module × rôle × connecté/mobile/offline/testé. Le score Lighthouse et l’installation Android nécessitent un environnement de navigateur/appareil compatible ; si indisponible, consigner précisément cette limite.

## Règles de validation d’une phase

1. Lire les fichiers et docs existants avant d’éditer; préserver les fonctions déjà actives.
2. Ne jamais annoncer une vérification qui n’a pas été exécutée.
3. Exécuter typecheck/lint/build aux étapes demandées et corriger les régressions de la phase.
4. Écrire docs/PHASE-X.md, checklist manuelle mobile/offline et points restant.
5. Ne passer à la phase suivante que lorsque la checklist est complète ou que chaque blocage externe est précisément documenté.
