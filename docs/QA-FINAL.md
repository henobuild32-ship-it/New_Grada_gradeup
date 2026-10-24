# QA finale — GradeUp phases 4 à 10

Légende : **Code** = présence/raccordement observé statiquement; **Mobile** = recette responsive réelle; **Offline** = coupure réseau et persistance observées; **Tests** = automatisation réellement exécutée. « À tester » signifie qu'aucune preuve n'est disponible, pas que l'action échoue.

| Module | Rôle(s) | Connecté / code | Mobile réel | Offline réel | Testé automatiquement |
| --- | --- | --- | --- | --- | --- |
| Codes école et élève | Admin, élève, parent | Génération cryptographique, normalisation, vérification limitée et portée école; migrations uniques déployées sur Supabase | À tester | Brouillons/envoi différé du parcours en attente de recette device | `test:codes` 3/3; en production, code école valide et route code élève invalide vérifiés; code enfant valide non testé |
| Mot de passe oublié / OTP | Tous rôles | SMTP configuré en Production; OTP salé, TTL 10 min, 5 essais, usage unique transactionnel, sessions révoquées | Formulaire à vérifier | Online-only | `test:otp` 2/2; routes production testées avec identité fictive; vraie livraison email à valider avec une boîte de recette |
| Admin dashboard/users/classes/courses/schedules | Admin | Code présent, API/CRUD | À tester | Snapshot/lectures partielles | TypeScript/lint/build; RBAC non relancé |
| Admin paiements/frais/cartes | Admin, caissier, parent | Code présent, multi-devise/reçus | À tester | PDF cache partiel | Tests métier sans finance DB |
| Règles notes/bulletins | Admin, titulaire, élève, parent | Workflow canonique raccordé | À tester | PDF lecture cache prévu | 6 tests moyens/sync; API non testée |
| Présences/QR/GPS | Admin, prof, élève, parent | Routes présentes et scopes renforcés | Caméra/GPS à tester | File QR/appel présente, non testée sur device | TypeScript/lint/build |
| Annonces/Gradie | Admin, tous rôles | Ciblage, limites et cache réponse local à l'instance | À tester | Messages hors ligne conservés; IA indisponible | TypeScript/lint/build |
| Prof enseignement quotidien | Prof | Leçons/devoirs/appel raccordés | À tester | Brouillon leçon + outbox à tester | Tests métier; parcours E2E non exécutés |
| Élève | Élève | Cours, notes, devoir, bulletin publiés | À tester | Lectures Dexie + file de remise (commentaire/fichier/reprise) implémentée, non testée sur appareil | Tests métier seulement; E2E à faire |
| Parent | Parent | Données enfant, soldes, bulletin et présence | À tester | Certains caches Dexie/LocalStorage | Ownership non testée sur DB cette session |
| Bibliothèque | Tous rôles | Visibilité serveur et upload présents | À tester | Téléchargement cache à tester | Non testé E2E |
| Messagerie | Tous rôles | Routes et UI présentes | À tester | Queue message à vérifier | Non testé E2E |
| Réunions | Tous rôles | UI/API présente | Caméra/micro/partage à tester | Audio seul/offline non applicable à valider | Non testé E2E |
| Calendrier/profil/aide | Tous rôles | API/UI présentes; accès classe multi-enfants corrigé | À tester | Cache agenda/aide à vérifier | Non testé E2E |
| Sync/outbox/PWA | Tous rôles | Dexie, pull/push, backoff présents | Installation réelle à tester | Non testé par appareil | 2 tests de règle sync |

## État des migrations production

- Le 24 octobre 2026, les migrations `20261024120000_add_schoolclass_option`,
  `20261024180000_add_rate_limit_buckets` et
  `20261024190000_secure_password_recovery` ont été appliquées sur la base
  Supabase du projet Vercel `gradeup.com`.
- `prisma migrate status` confirme que la base est à jour. Les secrets SMTP sont
  configurés, mais aucun email de récupération n'a été envoyé pendant la QA.
- Commit `9f22651` publié sur `main`; le déploiement Vercel Production est prêt
  et `gradeupcom.vercel.app` pointe vers ce déploiement.
- Smoke tests de production sans écriture métier : `/api/health` 200, code école
  valide 200, code élève invalide 200/`valid:false`, route privée anonyme 401;
  demande OTP fictive 200, vérification et reset fictifs 400. Aucun mail réel
  n'a été envoyé.

## Commandes vérifiées

- `npx tsc --noEmit` — réussi sur l'arbre final.
- `npm run test:business` — 6/6 réussis.
- `npm run test:codes` — 3/3 réussis; `npm run test:otp` — 2/2; `npm run test:public-routes` — 1/1.
- `npm run lint -- --quiet` — ESLint sur le dépôt réussi.
- `npm run build` — réussi sur l'arbre final; avertissements de dépréciation non bloquants sur `package.json#prisma` et middleware Next.
- `git diff --check` — réussi; seuls les avertissements de conversion LF→CRLF restent.

## Bloqueurs de recette

- Le navigateur local est désactivé dans Work; aucune QA authentifiée, visuelle, Lighthouse ou installation PWA ne peut être affirmée.
- `npm run test:rbac` requiert un serveur et une base de test seedée; il n'a pas
  été exécuté contre Production pour éviter les écritures métier sur les données réelles.
- E2E Playwright absent; aucune instance Android réelle n'est connectée.
- Fournisseurs SMS/email et paiements sandbox doivent être configurés pour leurs scénarios respectifs.

La matrice n'est donc pas entièrement verte et ne constitue pas un feu vert de production.
