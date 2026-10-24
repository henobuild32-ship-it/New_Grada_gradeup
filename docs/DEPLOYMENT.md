# Guide de déploiement GradeUp

## Prérequis

- Node.js 22 LTS recommandé (le test métier utilise `--experimental-strip-types`).
- PostgreSQL isolé par environnement et accessible par Prisma.
- Projet Supabase configuré pour Storage si les uploads sont utilisés.
- Domaine HTTPS pour cookies de session, PWA, caméra/GPS et Web Push.

## Configuration

1. Copier `.env.example` vers un fichier local non commité.
2. Renseigner `DATABASE_URL`, `DIRECT_URL`, secrets JWT, URL publique, Supabase et les fournisseurs réellement activés.
3. En production, définir `NEXT_PUBLIC_APP_URL`, `JWT_SECRET` et `JWT_REFRESH_SECRET` avec des valeurs uniques fortes. Ne jamais utiliser les valeurs de développement.
4. Configurer les clés VAPID, SMTP, GeniusPay ou IA uniquement si les parcours correspondants sont activés.
5. Vérifier les variables sans afficher leurs valeurs dans les journaux ou tickets.

Voir [`ENV.md`](ENV.md) pour le catalogue des variables.

## Installation et contrôles avant publication

```powershell
npm ci
npx prisma generate
npx prisma migrate deploy
npx tsc --noEmit
npm run lint -- --quiet
npm run test:business
npm run build
```

Les migrations et commandes DB doivent viser une base de recette ou de production explicitement choisie et sauvegardée. `npm run db:push`, `npm run db:seed` et `npm run db:reset` ne sont pas des commandes de déploiement; ne pas les exécuter sur une base partagée.

## Exécution

Le script `npm run build` génère le client Prisma, compile Next et prépare `.next/standalone`. `npm start` démarre l'artefact autonome. Déployer derrière HTTPS et vérifier `/api/health`, login, lecture par rôle, upload Storage, génération PDF et notification depuis un compte de recette.

## Services externes et limites

- Les notifications in-app sont locales à GradeUp. Push dépend des clés VAPID; SMS/email planifiés demandent un fournisseur et un ordonnanceur configurés.
- GeniusPay, Supabase et GLM/OpenRouter doivent être testés avec des identifiants de sandbox avant production.
- Les limites en mémoire (rate-limit/cache IA) sont propres à une instance; un déploiement multi-instances doit les déplacer vers Redis ou un service partagé.
- Prévoir sauvegarde PostgreSQL automatisée, rétention, restauration testée et rotation des secrets.
