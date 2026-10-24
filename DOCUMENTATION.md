# Documentation GradeUp

## Parcours produit

- [Guide utilisateur par rôle](docs/GUIDE-UTILISATEUR.md)
- [Plan des phases 0–10 et gates](docs/PLAN.md)
- [Audit de départ](docs/AUDIT.md)
- [API et permissions](docs/API.md)
- [Synchronisation offline](docs/SYNC.md)
- [Variables d'environnement](docs/ENV.md)
- [Déploiement](docs/DEPLOYMENT.md)

## Livrables de phase

- [Phase 0 — audit](docs/PHASE-0.md)
- [Phase 1 — fondations](docs/PHASE-1.md)
- [Phase 2 — PWA/offline](docs/PHASE-2.md)
- [Phase 3 — backend/sécurité](docs/PHASE-3.md)
- [Phases 4A à 4D — administration](docs/PHASE-4A.md), [4B](docs/PHASE-4B.md), [4C](docs/PHASE-4C.md), [4D](docs/PHASE-4D.md)
- [Phase 5A — professeur quotidien](docs/PHASE-5A.md)
- [Phase 5B — professeur évaluations](docs/PHASE-5B.md)
- [Phase 6 — élève](docs/PHASE-6.md)
- [Phase 7 — parent](docs/PHASE-7.md)
- [Phase 8 — modules transversaux](docs/PHASE-8.md)
- [Phase 9 — workflows E2E](docs/PHASE-9.md)
- [Phase 10 — QA finale](docs/PHASE-10.md) et [matrice](docs/QA-FINAL.md)

## Vérification locale

```powershell
npx tsc --noEmit
npm run lint -- --quiet
npm run test:business
npm run build
```

Le RBAC HTTP et les scénarios E2E exigent un serveur et une base de recette isolée. Ne lancez pas les seeds ou migrations contre une base distante par défaut.

## État de livraison

Les phases 4–10 contiennent des écrans et API raccordés à différents niveaux, mais ne sont pas certifiées terminées. Voir [`QA-FINAL.md`](docs/QA-FINAL.md) pour les vérifications exécutées, les parties non testées et les dépendances externes.
