# Phase 9 — Workflows inter-rôles

## Résultats observables

Les lignes marquées **code raccordé** ne signifient pas qu'un scénario E2E a passé sur une base seedée. Le navigateur Work étant désactivé, le serveur local/base de recette n'étant pas démarré et Playwright n'étant pas installé, la recette complète n'a pas pu être exécutée. Aucun résultat non observé n'est déclaré vert.

| Scénario | Écrans et routes principaux | État du code | Recette E2E |
| --- | --- | --- | --- |
| 1. Rentrée, classe→cours→horaire | Admin classes/courses/schedules; teacher courses/schedules; student/parent schedules | APIs et lectures par rôle présents; conflits horaire vérifiés côté serveur | Non exécutée |
| 2. Leçon/devoir/copie/correction | Teacher lessons/homework; student lessons/homework; submissions | Publication de leçon publiée explicitement; workflows devoir présents | Non exécutée |
| 3. Appel offline/justification | Teacher attendance; sync push; parent presence; absence justifications | Batch offline, ownership et décision serveur présents | Non exécutée |
| 4. Notes/verrou/rectification | Teacher grades; admin grade validation/modification; student/parent grades | Moyenne pure testée; endpoints de verrouillage/rectification présents | Non exécutée |
| 5. Bulletin double validation | Teacher canonical bulletins; admin bulletins; student/parent bulletins/PDF | Flux canonique relié génération→titulaire→admin→publication | Non exécutée |
| 6. Paiement/reçu/retard | Admin payments/tuition; parent payments | Versement, tranche, reçu et solde multi-devise; relances manuelles | E2E et planification automatique non exécutées |
| 7. Délibération/clôture | passages, deliberation, end-of-year | Écrans/API préexistants, checklist finale non confirmée | Non exécutée |
| 8. Coupure réseau pour les workflows | PWA/Dexie/outbox, devoirs, notes, présence, horaires | Backoff/online-only unitaires testés; parcours device incomplet | Non exécutée |

## Tests automatisés disponibles

- `npm run test:business` passe les six tests unitaires RDC, rang et sync.
- `npm run test:rbac` exige serveur et base de test seedée; le préflight a échoué sans serveur sur `localhost:3000`. Ne pas lancer contre une base distante.
- E2E Playwright absent du dépôt et aucune installation/appareil de recette disponible dans cette session.

## Gate de sortie

Cette phase ne peut pas être marquée terminée avant l'exécution des parcours 1–8 sur une base isolée, avec au moins un compte de chaque rôle et scénarios réseau coupé/repris.
