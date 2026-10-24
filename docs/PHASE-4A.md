# Phase 4A — Administration : pilotage et organisation

## État

**Partiellement réalisée.** Les indicateurs du tableau de bord utilisent les valeurs réelles du serveur, ventilent les revenus par devise et gardent un snapshot local. L'écran utilisateurs propose déjà CRUD, règles métier, import CSV avec aperçu/erreurs, export, filtres, actions groupées et photo compressée. Les parcours authentifiés n'ont pas pu être testés visuellement : le navigateur reste indisponible dans cette session.

| Module | Résultat actuel | Reste à fermer |
| --- | --- | --- |
| `admin-dashboard` | Comptages réels, revenus par devise, présence présent/total, graphique sans addition de monnaies. | Vérifier flux d'activité/actions rapides et réouverture offline. |
| `admin-users` | Sexe M/F requis, dates/règles métier, classe obligatoire, matricule serveur, lien parent, import/export CSV, filtres, actions groupées, photo. | Import Excel/XLSX et recette import volumineux hors ligne/réseau. |
| `admin-classes` | CRUD, liens titulaire/cours présents. | Vérifier transfert d'élève, frais et effectifs par tenant. |
| `admin-courses` | Affectation classe/professeur et lecture locale. | Vérifier volume horaire et application du coefficient annuel. |
| `admin-schedules` | Grille jour/semaine, déplacement par glisser-déposer sur ordinateur et édition sur téléphone, conflits serveur, duplication, publication et cache hors ligne. | Recette réelle sur mobile et vérification des conflits prof/classe/salle. |
| `admin-school-calendar` | Périodes 1–4, périodes/vacances/fermetures et verrous serveur. | Vérifier chaque API de note quand une période est verrouillée. |
| `admin-config` | Informations école, devise, logo, code, GPS et préférences présents. | Connecter et vérifier chaque prestataire de notification. |

## Checklist mobile/offline

- [ ] Vérifier 360–400 px et 768 px : tableaux, formulaires et grilles sans débordement.
- [ ] Déconnecter puis recharger : snapshot et date de fraîcheur sont visibles.
- [ ] Vérifier lecture offline des classes, cours et horaires déjà synchronisés.
- [ ] Vérifier le refus explicite d'une opération sensible sans réseau.
- [ ] Publier un horaire et vérifier la visibilité élève/professeur/parent.

## Vérifications exécutées

- `npx tsc --noEmit` : réussi.
- `npm run lint -- --quiet` : réussi.
- `npm run build` : réussi; avertissements existants de dépréciation `package.json#prisma` et convention middleware Next.js.
- `git diff --check` : réussi (avertissements Git de conversion CRLF seulement).
- `npm run test:rbac` : non exécuté jusqu'aux scénarios; échoue au préflight car aucun serveur ne répond sur `localhost:3000`. Le script exige une base seedée; aucune base distante n'a été initialisée ou modifiée.
- Recette mobile visuelle : indisponible, navigateur Work désactivé dans cette session.
