# Phase 6 — Élève

## État

**Partiellement réalisée.** Les écrans élève couvrent tableau de bord, cours, leçons, notes, bulletins, devoirs, présence, horaires, IA et notifications. Les lectures déjà intégrées à Dexie et le service worker permettent de réutiliser une partie des données synchronisées. La route des bulletins et la sync ne doivent exposer que les bulletins publiés et les données du compte courant.

| Parcours | État du code | Écarts à fermer |
| --- | --- | --- |
| Dashboard et notes | Écrans/API réels, lecture notes avec repository local. | Vérifier le résumé par données locales et fraîcheur affichée. |
| Leçons/horaires | Lecture Dexie; la route filtre les cours et leçons publiés. | Vérifier pièces jointes téléchargées et progression. |
| Bulletins | Vue du modèle canonique; seuls les statuts `PUBLISHED` sont renvoyés; PDF peut être téléchargé et mis en cache. | Recette ownership d'un autre élève et ouverture PDF hors ligne. |
| Devoirs/copies | Dépôt hors ligne conservé dans IndexedDB (commentaire + Blob), reprise au retour réseau, statut par devoir, reprise manuelle après erreur; répétition identique sans renotification. | Tester photos comprimées, PDF et reprise sur appareils réels; limites navigateur et quota de stockage. |
| Présence/notifications | Historique et centre disponibles. | Test multi-appareils, synchronisation lu/non-lu et push réel. |
| IA | Disponible en ligne, état offline explicite. | Tester quotas et brouillons locaux sur Android réel. |

## Checklist de confidentialité

- [ ] Tester `/api/users`, `/api/grades`, `/api/attendance`, `/api/bulletins`, `/api/sync/pull` avec deux élèves.
- [ ] Confirmer qu'un élève ne voit que sa classe, ses notes, devoirs, présence et bulletins publiés.
- [x] File locale et reprise automatique/manuelle du dépôt implémentées; upload repris avant la copie et URL conservée après un upload réussi.
- [ ] Couper/rétablir le réseau sur appareil réel; vérifier le statut en attente, un seul dépôt et la réponse du professeur.
- [ ] Lire le dernier bulletin publié et son PDF après premier téléchargement hors ligne.
- [ ] Vérifier le rendu portrait à 360 px et la navigation clavier.
