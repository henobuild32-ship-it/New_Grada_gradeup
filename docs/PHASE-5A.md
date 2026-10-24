# Phase 5A — Professeur : enseignement quotidien

## État

**Partiellement réalisée; aucune recette mobile authentifiée n'a été exécutée.** Les écrans du professeur et leurs routes existent. Les leçons sont désormais explicitement publiées en ligne, les brouillons texte sont sauvegardés localement avec aperçu Markdown, et la lecture élève reste cachée tant que le cours et la leçon ne sont pas publiés.

| Module | État du code | Écarts à fermer |
| --- | --- | --- |
| Dashboard, cours, classes | Écrans et API liés au compte professeur. | Parcours de rentrée réel, titulaire et chargement/erreurs à valider sur compte. |
| Leçons | Publication `isPublished`, notification de classe, audit, brouillon texte local et aperçu Markdown. | Pièce jointe d'un brouillon non conservée localement; éditeur MDX complet et recette offline à faire. |
| Documents | Bibliothèque et routes d'upload/visibilité disponibles. | Téléchargement local, reprise d'upload et partage par classe à vérifier. |
| Devoirs/copies | Création, remise, consultation et correction présents. | Rendre idempotent et vérifier chaque notification du parcours complet. |
| Appel | File offline côté client et batch serveur; les alertes sont déclenchées par le serveur à la synchronisation. | Coupure réseau, reprises, absence de doublon et remise à notifier à tester sur base locale. |
| Horaires/notifications | Lectures horaires et centre de notifications présents. | Vérifier fraîcheur offline, push et droits de destinataire. |

## Checklist mobile/offline

- [ ] À 360 px, faire l'appel avec les gros boutons et sauvegarder hors réseau, puis reconnecter.
- [ ] Fermer/réouvrir l'écran Leçons et vérifier restauration du brouillon texte.
- [ ] Publier en ligne; vérifier qu'un élève inscrit voit la leçon et reçoit l'annonce.
- [ ] Vérifier qu'une pièce jointe non uploadée n'est pas présentée comme sauvegardée.
- [ ] Créer un devoir, déposer une copie élève, corriger, puis consulter côté élève/parent.
- [ ] Lire cours, leçons déjà synchronisés et horaires sans réseau.

## Vérifications automatisées

- `npx tsc --noEmit`, `npm run lint -- --quiet` et `npm run build` passent sur l'arbre final.
- `npm run test:business` teste les calculs RDC et les règles d'attente offline.
- Aucun parcours navigateur authentifié ou device mobile n'a été exécuté dans cette session.
