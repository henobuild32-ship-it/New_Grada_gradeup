# Variables d'environnement — GradeUp

Ce document répertorie toutes les variables d'environnement utilisées par le projet.
L'exemple complet se trouve dans [`.env.example`](../.env.example) — copier ce fichier en `.env` puis renseigner les valeurs réelles.

## Règles générales

- **`JWT_SECRET`** et **`JWT_REFRESH_SECRET`** sont **OBLIGATOIRES en production** (`NODE_ENV=production`) ;
  des fallbacks de développement existent (`gradeup-dev-*-secret-change-me`) mais ne doivent jamais servir en prod.
- **`NODE_ENV=production` exige `NEXT_PUBLIC_APP_URL`** (URL publique utilisée pour les métadonnées, le sitemap, les références IA et les redirects).
- Ne jamais committer le vrai `.env`.

---

## App

| Variable | Obligatoire | Rôle | Exemple |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Prod (obligatoire), dev (recommandée) | URL publique de l'application (métadonnées, sitemap, redirects) | `https://mon-app.vercel.app` |
| `NODE_ENV` | Non | Environnement d'exécution (`production` / `development`) | `production` |

## Base de données (PostgreSQL / Prisma)

| Variable | Obligatoire | Rôle | Exemple |
|---|---|---|---|
| `DATABASE_URL` | Oui | URL de connexion Prisma (mot de passe URL-encodé) | `postgresql://user:***@host:5432/db?sslmode=require` |
| `DIRECT_URL` | Oui | Connexion directe pour les migrations Prisma | `postgresql://user:***@host:5432/db?sslmode=require` |
| `DB_HOST` | Oui | Hôte PostgreSQL (fallback si `DATABASE_URL` absent) | `pg6001.site4now.net` |
| `DB_PORT` | Oui | Port PostgreSQL | `6432` |
| `DB_NAME` | Oui | Nom de la base | `db_acfa94_***` |
| `DB_USER` | Oui | Utilisateur PostgreSQL | `acfa94_***` |
| `DB_PASSWORD` | Oui | Mot de passe PostgreSQL | `***` |
| `DB_SSLMODE` | Non (défaut `require`) | Mode SSL de la connexion | `require` |

## Auth (JWT)

| Variable | Obligatoire | Rôle | Exemple |
|---|---|---|---|
| `JWT_SECRET` | **Prod : obligatoire** (fallback dev) | Secret de signature des tokens d'accès | `long-random-string-***` |
| `JWT_REFRESH_SECRET` | **Prod : obligatoire** (fallback dev) | Secret de signature des tokens de rafraîchissement | `long-random-string-***` |

## Storage (Supabase)

| Variable | Obligatoire | Rôle | Exemple |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Oui | URL du projet Supabase (client + serveur) | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Oui | Clé anon (client, RLS) | `eyJhbGciOi...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Oui (serveur) | Clé service_role — **jamais exposée au client** | `eyJhbGciOi...` |
| `SUPABASE_STORAGE_BUCKET` | Non (défaut `gradeup`) | Nom du bucket Storage (cours, devoirs, photos…) | `Gradeup` |

## Push / Notifications

| Variable | Obligatoire | Rôle | Exemple |
|---|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Pour Web Push PWA | Clé publique VAPID | `BOrx...` |
| `VAPID_PRIVATE_KEY` | Pour Web Push PWA (serveur) | Clé privée VAPID | `***` |
| `NEXT_PUBLIC_ONESIGNAL_APP_ID` | Optionnel (OneSignal) | ID d'app OneSignal | `xxxxxxxx-xxxx-xxxx` |
| `ONESIGNAL_REST_API_KEY` | Optionnel (OneSignal) | Clé REST OneSignal (serveur) | `***` |
| `ONESIGNAL_REST_API` | Optionnel | Alias accepté de `ONESIGNAL_REST_API_KEY` | `***` |

## Paiements

| Variable | Obligatoire | Rôle | Exemple |
|---|---|---|---|
| `GENIUSPAY_API_BASE_URL` | Oui (paiements) | URL de base de l'API GeniusPay | `https://geniuspay.ci/api/v1/merchant` |
| `GENIUSPAY_API_KEY` | Oui (paiements) | Clé marchand (publique) | `pk_live_***` |
| `GENIUSPAY_API_SECRET` | Oui (paiements) | Secrète marchand (serveur) | `sk_live_***` |
| `STUDENT_CARD_PRICE_USD` | Non (défaut `10`) | Prix de la carte élève en USD | `10` |

## Email / SMTP (Nodemailer — OTP)

| Variable | Obligatoire | Rôle | Exemple |
|---|---|---|---|
| `SMTP_HOST` | Oui (OTP email) | Hôte SMTP | `smtp.example.com` |
| `SMTP_PORT` | Oui (OTP email) | Port SMTP (`587` ou `465`) | `587` |
| `SMTP_SECURE` | Non | `true` si port 465 | `false` |
| `SMTP_USER` | Oui (OTP email) | Utilisateur SMTP | `no-reply@***` |
| `SMTP_PASS` | Oui (OTP email) | Mot de passe SMTP | `***` |
| `SMTP_FROM` | Non (défaut `SMTP_USER`) | Adresse d'expéditeur | `no-reply@***` |
| `SMTP_REJECT_UNAUTHORIZED` | Non | Désactiver la vérif TLS (dev uniquement) | `false` |

## IA (Gradie)

| Variable | Obligatoire | Rôle | Exemple |
|---|---|---|---|
| `GLM_API_KEY` | Oui (fournisseur GLM) | Clé API Zhipu AI (GLM) | `***` |
| `GLM_MODEL` | Non (défaut `glm-4.5-flash`) | Modèle GLM utilisé | `glm-4.5-flash` |
| `OR_API_KEY` | Optionnel (OpenRouter) | Clé API OpenRouter | `sk-or-***` |
| `OR_MODEL` | Non | Modèle OpenRouter par défaut | `deepseek/deepseek-chat-v3-0324:free` |
| `DEEPSEEK_API_KEY` | Optionnel | Clé API DeepSeek directe | `***` |

## Admin

| Variable | Obligatoire | Rôle | Exemple |
|---|---|---|---|
| `ADMIN_OPS_KEY` | Recommandée en prod | Clé opérations admin (header `x-admin-secret` pour `/api/admin/db-health`) ; fallback `JWT_SECRET` | `***` |
