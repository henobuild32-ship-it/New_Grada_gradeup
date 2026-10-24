# Phase 5B — Professeur : évaluation et bulletins

## État

**Partiellement réalisée.** La page professeur « Bulletins » est maintenant raccordée au modèle canonique `Bulletin`: choix classe/période, génération serveur, contrôles de notes manquantes, relecture de l'appréciation et transmission titulaire en ligne. Le calcul des moyennes et rangs est séparé en fonctions pures et couvert par des tests unitaires.

| Module | État du code | Écarts à fermer |
| --- | --- | --- |
| Notes/cahier de cotation | Saisie, maxima, coefficients, périodes et sync existants; moyenne normalisée par note sur son maximum réel. | Recette offline/reconnexion et cohérence avec tous les rapports historiques. |
| Rectification | Demande/API de modification et écran de suivi présents. | Tester décision motivée, audit et notification du professeur. |
| Bulletins titulaire | `/api/bulletins/generate` → `/validate-titulaire`; page cache le dernier résultat par classe/période pour lecture offline. | Recette serveur avec notes complètes/manquantes et concurrence. |
| Avis de fin de cursus | Écrans/API de délibération présents. | Valider les décisions et le rôle professeur avec la direction. |
| IA pédagogique | Gradie disponible en ligne avec erreurs lisibles. | Contrôler quota, sauvegarde locale des brouillons IA et pièces jointes. |

## Tests unitaires

`npm run test:business` passe 6/6 tests : maxima mixtes, coefficients, notes invalides, mentions, rangs à égalité, backoff et opérations online-only. Cela ne remplace pas les tests DB des routes.

## Checklist

- [ ] Saisir les différents types d'évaluation, y compris note sur 10, 50 et 100.
- [ ] Verrouiller une période côté admin et confirmer le refus côté prof et dans le push offline.
- [ ] Corriger une note après demande motivée et vérifier l'historique.
- [ ] Générer, relire, transmettre un bulletin; faire refuser l'accès à un autre titulaire.
- [ ] Vérifier note manquante, rang ex æquo, commentaire, appréciation et cache local.
