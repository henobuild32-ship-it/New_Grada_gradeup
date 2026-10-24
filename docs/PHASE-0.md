# PHASE 0 — Audit et cartographie

> Statut : terminée pour l’inventaire et les vérifications locales. Le seed et les tests d’autorisation ont été exécutés sur une base PostgreSQL de développement isolée, liée uniquement à localhost. Cela ne valide pas la base distante ni la production.

## Réalisé

- Mis à jour docs/AUDIT.md avec les matrices ADMIN, TEACHER, STUDENT, PARENT, CAISSIER (rôle additionnel) et les modules transversaux.
- Documenté les pages mortes/orphelines, l’écart Bulletin/ReportCard, les API manquantes, les écarts de types et les constats de sécurité.
- Mis à jour docs/PLAN.md avec les phases 0 à 10, l’ordre, l’effort indicatif et les critères de sortie.
- Corrigé uniquement le helper de préparation standalone : un build local Windows ne tente plus de télécharger des binaires Linux, sauf si GRADEUP_STANDALONE_TARGET=linux est demandé.

## Vérifications

| Vérification | Résultat |
|---|---|
| npx tsc --noEmit | Réussi, 0 erreur |
| npm run lint | Réussi, 0 erreur |
| npm run build | Réussi, code 0 ; warnings non bloquants : configuration Prisma package.json dépréciée et convention Next middleware dépréciée |
| Base de test locale | PostgreSQL de développement temporaire sur 127.0.0.1:5433 ; schéma synchronisé et seed chargé |
| /api/health | HTTP 200 sur le serveur local |
| npm run test:rbac | Réussi : 79/79 contrôles, dont limites de rôle, isolation inter-écoles, bulletins publiés, transitions, sync, notifications, code parent, horaires, cours, leçons, notes et listes utilisateurs |
| scripts/verify-grade-promotion-flow.js | Lecture vérifiée : 2 écoles, 12 élèves/inscriptions, 22 notes ; promotionHistory, notes et évaluations lisibles |

## Checklist

- [x] Modules des rôles principaux et rôle CAISSIER répertoriés.
- [x] Modules transversaux présents dans la cartographie.
- [x] Incohérences, API incomplètes, priorités et constats de sécurité consignés.
- [x] Build, lint et typecheck exécutés.
- [x] RBAC de bout en bout exécuté sur le serveur standalone et la base de développement isolée ; 79/79 contrôles.
- [x] Aucun code métier modifié ; seul le helper de packaging a été corrigé après échec bloquant du build initial.

## Fichiers modifiés

- docs/AUDIT.md
- docs/PLAN.md
- docs/PHASE-0.md
- scripts/prepare-standalone.js

## Checklist manuelle mobile/offline

Aucun changement UX ou sync n’est introduit en phase 0. La recette complète mobile/offline reste dans les phases 1, 2 et 10. Les rapports historiques PHASE-1.md et PHASE-2.md décrivent des QA déjà réalisées, mais elles ne sont pas requalifiées ici comme une QA finale.
