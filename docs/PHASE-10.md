# Phase 10 — Performance, accessibilité, sécurité et QA finale

## État

**Partiellement réalisée; gate de production ouverte.** TypeScript, ESLint et build de production passent au moment de cette vérification. Des corrections de permissions, de tenant, de publication et de média/données ont été apportées. Lighthouse, lecteurs d'écran, appareil Android, charge 3G et parcours de tous les boutons n'ont pas été validés.

| Axe | Travail vérifiable | Mesure ou reste à faire |
| --- | --- | --- |
| Performance | Découpage Next/dynamic déjà présent, cache de contexte IA et cache mémoire de réponses non-mutantes (5 min, isolé par utilisateur). | Aucun score Lighthouse mesuré; budget JS, 3G, virtualisation et appareil bas de gamme à mesurer. |
| Accessibilité | Labels/états sont présents sur plusieurs écrans; parcours clavier partiels. | Audit complet clavier, lecteur d'écran, contraste, zoom et reduced motion. |
| Sécurité | Garde tenant/location, classe, présence, bulletin, paiement, notification et actions IA renforcées; journal d'audit ajouté sur plusieurs mutations. | Revue complète de 145+ routes, XSS/CSRF/upload, secrets, rate-limit distribué et politique de géolocalisation. |
| Robustesse | Error/empty/loading states et Dexie/outbox existent; tests unitaires ajoutés sur moyenne/backoff. | Error boundaries globaux, surveillance, sauvegarde DB et migration IndexedDB en scénario à vérifier. |
| Zéro bouton mort | Routes et actions majeures raccordées; le workflow bulletin prof a été remplacé par le canonique. | Parcourir toutes les pages et tous les contrôles par rôle; pas de preuve de couverture totale. |
| Documentation | Guides de rôle, déploiement, phases et QA livrés dans `docs/`. | Mettre à jour les éléments de déploiement après choix des fournisseurs externes. |

## Checklist finale

- [ ] Lighthouse mobile performance ≥ 90 et PWA ≥ 90 sur un environnement reproductible.
- [ ] Test 3G lent et Android d'entrée de gamme.
- [ ] Matrice `/docs/QA-FINAL.md` entièrement validée par navigateur et API.
- [ ] E2E Playwright verts sur scénarios `PHASE-9.md`.
- [ ] Installation PWA et permission caméra/GPS testées sur appareil Android réel.
- [ ] Vérifier sauvegarde/restauration DB et mises à jour d'IndexedDB.

## Contrôles exécutés lors de cette reprise

- `npx tsc --noEmit` : réussi après les dernières modifications.
- `npm run lint -- --quiet` : réussi après les dernières modifications.
- `npm run test:business` : 6/6 réussis.
- `git diff --check` : réussi; Git signale seulement la conversion de fins de lignes LF→CRLF.
- `npm run build` : réussi après les derniers changements; seules les dépréciations non bloquantes Prisma `package.json#prisma` et middleware Next apparaissent.
- Le navigateur local est désactivé par les réglages Work; aucun résultat mobile/Lighthouse n'est revendiqué.
