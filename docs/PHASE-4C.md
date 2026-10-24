# Phase 4C — Administration : cotation, notes et bulletins

## État

**Partiellement réalisée.** Le calcul serveur résout maintenant les coefficients configurés et normalise chaque note à partir de son maximum réel avant de calculer la moyenne de matière. Le professeur titulaire utilise désormais la même page canonique de bulletins que les routes serveur; tests unitaires ajoutés pour maxima, moyenne pondérée, mention et rang. La validation, les verrous, demandes de correction et écrans de délibération existaient. Le modèle `Bulletin` gère génération → validations → publication → PDF; élèves et parents ne consomment que les bulletins publiés. L'ancien `ReportCard` reste en place pour compatibilité.

| Module | Résultat actuel | Reste à fermer |
| --- | --- | --- |
| `admin-coefficients`, `admin-cotation-rules` | Coefficients actifs raccordés au calcul; décision applique seuils de classe et règle éliminatoire. Maxima 10/20/50/100 respectés via `maxScore`. | Cas de tests RDC, maxima et règles dédiées; unifier avec l'ancien moteur du cahier. |
| `admin-grade-validation`, `admin-note-modifications`, `cahier-cotation` | Routes de validation/correction et contrôles de période présents. | Tester motif rejet, notification prof et toutes écritures verrouillées. |
| `admin-bulletins` | Écran menu + génération sur notes réelles, filtres, validation titulaire/admin, publication et PDF. | Tester titulaire/établissement, notes manquantes et transitions concurrentes. |
| Élève/parent | Lecture du modèle canonique, uniquement publié; PDF officiel téléchargeable et caché hors ligne après téléchargement. | Test d'ownership et d'ouverture PDF offline authentifiés. |
| `admin-passages`, `admin-end-of-year` | Écrans/API de passage et clôture annuels existants. | Vérifier décisions, double confirmation, sauvegarde, annulation et idempotence. |
| `ReportCard` historique | Toujours présent. | Migrer données/consommateurs et supprimer l'ancien workflow avant de déclarer l'unification terminée. |

## Checklist mobile/offline

- [ ] Tester les permissions titulaire/administration et les données inter-écoles.
- [ ] Générer une classe avec notes complètes puis une classe avec notes manquantes.
- [ ] Tester égalités de rang, coefficients, seuils, note éliminatoire et rattrapage.
- [ ] Verrouiller une période et tester création/modification via chaque route de notes.
- [ ] Suivre DRAFT → VALIDATED_TITULAIRE → VALIDATED_ADMIN → PUBLISHED.
- [ ] Vérifier qu'élève/parent ne voient aucun brouillon et récupèrent le PDF offline après cache.
- [ ] Clôturer une année uniquement sur une base de test sauvegardée.

Voir `docs/API.md` §6.8 pour les nouvelles routes canoniques `/api/bulletins/*`. Publication en ligne uniquement.

## Vérifications exécutées

- `npm run test:business` : 6/6 tests unitaires calculs RDC/synchronisation réussis.
- `npx tsc --noEmit`, `npm run lint -- --quiet` et `npm run build` : réussis sur l'arbre final.
- Scénarios authentifiés et tests de données : non exécutés; serveur local/base seedée manquants.
- Recette mobile/PDF hors ligne visuelle : non exécutée; navigateur Work désactivé.
