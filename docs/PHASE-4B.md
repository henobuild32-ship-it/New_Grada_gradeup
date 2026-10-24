# Phase 4B — Administration : finances et cartes

## État

**Partiellement réalisée.** Les paiements et soldes ont été corrigés pour séparer les devises, relier une tranche, générer un reçu unique côté serveur, tracer les corrections et conserver le PDF téléchargé en cache local.

| Module | Résultat actuel | Reste à fermer |
| --- | --- | --- |
| `admin-payments` | Paiement USD/CDF, tranche, statuts, totaux par devise, numéro de reçu, correction auditée, PDF/partage/cache hors ligne. | Export financier et filtres classe/période à vérifier; test concurrence reçu et notification parent. |
| `admin-tuition` | Solde réel par devise/élève, échéancier, paiement lié à tranche, relance parent par notification. | Relances automatiques avant échéance et mesure du recouvrement à confirmer. |
| `admin-cards` | Photos, matricule, QR sur l'URL du domaine courant et impression en lot via impression navigateur. | Pas de PDF planche côté application; mode statique léger, cachet et recto-verso à vérifier. |
| `parent-payments` | Lectures parent-scopées, solde réel par devise et échéancier, reçu officiel téléchargeable/cache local, paiements ventilés par devise. | Recette parent-caisse, partage mobile et rappels d'échéance en parcours lié. |

## Checklist mobile/offline

- [ ] Vérifier les totaux USD et CDF séparément.
- [ ] Associer un paiement à une tranche; rejeter doublon, montant/devise incohérents.
- [ ] Corriger/annuler un paiement; vérifier audit, solde parent et notification.
- [ ] Partager puis rouvrir un reçu téléchargé hors connexion.
- [ ] Imprimer une classe sur papier A4 et vérifier lisibilité du QR et du recto/verso.
- [ ] Vérifier qu'un paiement offline affiche une erreur explicite et ne crée pas de doublon.

## Vérifications exécutées

- `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build` et `git diff --check` : réussis.
- RBAC authentifié non exécuté : serveur local indisponible au préflight; aucune base de production n'a été seedée.
- Les passerelles et fournisseurs SMS/email ne sont pas déclarés testés sans identifiants de service.
