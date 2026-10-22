# Page d'accueil GradeUp — livrables de la refonte

Référence visuelle et technique de la nouvelle page d'accueil (landing publique), livrée
dans `src/components/landing/`. Tout le texte est en français.

## 1. Arborescence

```
public/
├── fonts/inter-latin-wght-normal.woff2   # Inter variable auto-hébergée (48 Ko, font-display: swap)
├── logo-mark.svg                         # Marque : carré #1D4ED8 + toque académique blanche
├── favicon.png / favicon-32.png / icon-192x192.png / icon-512x512.png / icon-maskable-512.png
└── generate-icons.js                     # Régénère tous les icons/favicons à partir du SVG

src/app/
├── globals.css                           # Tokens + @font-face + utilitaires landing
├── layout.tsx                            # Metadata, favicon, manifest, ThemeProvider
└── page.tsx                              # Entrée SPA : visiteur → AuthPage, session → AppLayout

src/components/landing/
├── landing-page.tsx      Assemblage des 16 sections + skip-link ; exports `LandingPage`, `LandingAction`
├── content.ts            Tout le contenu FR (textes, libellés, FAQ, étapes, engagements…)
├── primitives.tsx        Container/Section/Eyebrow/Reveal/BrandButton/GhostButton/Icon (map d'icônes)
├── device-frames.tsx     Maquettes produit : LaptopFrame, PhoneFrame, Dashboard/Bulletin/Cahier/… Screen
├── site-header.tsx       Barre d'annonce fermeable, nav, menu plein écran (focus-trap, Échap), bascule thème
├── site-footer.tsx       4 colonnes desktop / accordéons mobiles, contact, mentions, v3.6
├── hero.tsx              Titre + CTA + laptop/téléphone (desktop) ou téléphone seul (mobile)
├── trust-bar.tsx         3 preuves (hébergement, sauvegarde, support WhatsApp)
├── problem-solution.tsx  3 duos AVANT / AVEC GRADEUP
├── features-bento.tsx    Grille bento : cahier de cotation, finances, classes, présences, notes, …
├── gradie-section.tsx    Démo conversationnelle Gradie (messages d’exemple, non simulés côté serveur)
├── profiles-tabs.tsx     Direction / Enseignants / Parents / Élèves (onglets)
├── steps-section.tsx     3 étapes d’onboarding + lien « Comment ça marche »
├── pwa-section.tsx       Installation PWA (détection réelle de `beforeinstallprompt`, étapes iOS/Android)
├── security-section.tsx  4 engagements (rôles, sauvegarde, HTTPS, confidentialité)
├── testimonials-section.tsx  Rendu uniquement si des avis approuvés existent (sinon masqué)
├── contact-section.tsx   Bloc « tarifs » = demande de démonstration (pas de prix publics)
├── faq-section.tsx       Accordéon (une seule question ouverte)
└── final-cta.tsx         CTA final + rappel WhatsApp
```

Ordre rendu par `landing-page.tsx` : header → hero → trust-bar → problem-solution →
features-bento → gradie → profils → étapes → pwa → sécurité → témoignages → contact →
faq → CTA final → footer.

Ancre de contenu : `#contenu` (skip-link), cibles d’ancres : `#top`, `#fonctionnalites`,
`#profils`, `#etapes`, `#securite`, `#avis`, `#tarifs`, `#faq`.

## 2. Tokens (`src/app/globals.css`)

| Jeton | Valeur | Rôle |
| --- | --- | --- |
| `--brand` | `#1D4ED8` | Accent unique (boutons, liens, éyebrows) |
| `--brand-hover` / `--brand-active` | `#1E40AF` / `#1E3A8A` | Survol / pression |
| `--brand-subtle` | `rgba(29, 78, 216, 0.08)` | Fonds teintés légers |
| `--signal` | `#059669` | Vert réservé aux validations (« avec GradeUp », confirmations) |
| `--line` / `--surface` | `#E5E7EB` / `#FFFFFF` | Bordures et surfaces (variables en mode sombre) |
| `--text-display` | `clamp(2.25rem, 5.5vw, 3.75rem)` | Titre hero |
| `--text-h2` / `--text-h3` | `clamp(1.75rem, 3.2vw, 2.5rem)` / `1.25rem` | Titres de section |
| `--text-lead` / `--text-eyebrow` | `1.125rem` / `0.8125rem` | Chapô et éyebrow majuscule |

Utilitaires : `.landing-container` (1200 px), `.landing-section` (64 px → 128 px ≥ lg),
`.landing-eyebrow`, `.landing-underline` (trait de marque sous un mot du titre),
`.skip-link`, `:focus-visible`, `motion-reduce:*` sur les révélations.

Inter est chargée en variable font locale : aucun appel réseau tiers, `font-display: swap`.

## 3. Contenu

Tout le contenu éditorial vit dans `src/components/landing/content.ts` (hero, sections,
FAQ, étapes, engagements, coordonnées, liens du footer). Modifier un texte = modifier ce
fichier ; aucun composant ne contient de littéral de mise en page.

## 4. Éléments à remplacer par de vraies données (avant mise en production)

- **Témoignages** : la section est masquée tant que la table d’avis n’a pas d’entrée
  approuvée. Aucun faux avis n’est affiché ; publier de vrais avis (module admin) suffit
  à l’activer.
- **Maquettes produit** (`device-frames.tsx`) : ce sont des rendus React fidèles à
  l’interface (chiffres illustratifs : 486 élèves, 27 enseignants, minerval 72 %). Pour
  la preuve produit, remplacer par de vraies captures d’écran à haute résolution.
- **Aucun logo client, aucun prix publics** : volontaire. Le bloc « tarifs » est une
  demande de démonstration.
- **Import de données** : l’application n’a pas d’import CSV/Excel (uniquement export) ;
  l’étape 3 et la FAQ le disent honnêtement. Ne pas promettre un import qui n’existe pas.
- **Coordonnées** : WhatsApp `+243 845 072 349`, Instagram `@axion_labs_technologies`,
  site Axion Labs — à revalider avant publication.
- **Version** : `v3.6` affichée dans le footer.

## 5. Checklist de recette

Automatisée (Chrome headless via `puppeteer-core`) :

```bash
node .zscripts/qa-shots.js    # 360 / 390 / 768 / 1024 / 1440 × clair/sombre, captures pleine page
node .zscripts/qa-detail.js   # coupes mobiles de 844 px pour juger la lisibilité
node .zscripts/qa-flows.js    # menu mobile (ouverture/Échap), connexion, retour, démo, FAQ, inscription
npx tsc --noEmit              # 0 erreur
npm run lint                  # 0 erreur
```

Résultat constaté (14/10/2026) : aucun débordement horizontal sur les 5 largeurs × 2
thèmes ; `theme="dark"` bien appliqué ; menu mobile ouvert/fermé par Échap ; vue
connexion et vue inscription rendues avec le nouvel en-tête et le pied de page partagé ;
CTA « Demander une démo » qui scrolle vers le bloc contact ; accordéon FAQ qui s’ouvre.

À vérifier manuellement :

- [ ] Clavier seul : tabulation dans l’en-tête, le menu mobile (piège à focus), les
      onglets profils, l’accordéon FAQ et le formulaire de contact.
- [ ] `prefers-reduced-motion` : aucune animation de révélation.
- [ ] Annonce d’en-tête : fermeture persistée au rechargement.
- [ ] Bascule Clair / Sombre / Système dans le menu mobile.
- [ ] Formulaire de contact : ouvre WhatsApp avec un message pré-rempli.
- [ ] CTA « Rejoignez votre école » → vue inscription parent/enseignant/élève.
- [ ] Mode sombre : contrastes des maquettes produit (intentionnellement claires).
- [ ] Réseau lent / coupé : la page reste lisible, la PWA répond hors ligne.

## 6. Notes de décisions

- **Hero aligné à gauche** partout (desktop comme mobile), jamais centré.
- **Un seul bouton primaire par écran** : `Créer mon école` (hero), `Demander une démo`
  (bloc contact), `Créer mon école` (CTA final). Tout le reste est secondaire.
- **Palette unique bleu profond** ; le vert émeraude ne sert qu’aux validations.
  Aucun dégradé bleu-violet, aucun effet verre dépoli, aucun emoji, aucun poids 900.
- **Mode clair par défaut** ; le mode sombre est complet mais reste un choix explicite
  (next-themes est configuré `defaultTheme="light"`, `enableSystem`).
- **La page d’accueil est rendue depuis `AuthPage` (vue `welcome`)** car l’application
  est une SPA unique : le HTML complet de la landing est tout de même produit côté
  serveur (visiteurs non connectés), donc indexable.
- **`page.tsx` n’affiche plus l’écran de chargement pour un visiteur sans session** :
  le splash est réservé à ceux qui ont une session locale, afin d’éviter un blanc au
  premier affichage de la page publique.

## 7. Dettes connues (hors périmètre de cette refonte)

- **Hydration React 19** : une erreur « Hydration failed » est levée à chaque page
  (`/`, `/faq`, `/help`) — préexistante, liée au `<script>` de thème rendu dans
  l’arbre client. À traiter dans une passe dédiée.
- **Écrans d’authentification** (connexion, inscription, mot de passe oublié) :
  seuls l’en-tête et le pied de page ont été harmonisés ; les formulaires gardent
  l’ancien visuel (dégradé violet) et sont à refondre sur ces tokens.
- **Sécurité** : 49 routes API sans contrôle d’accès, `/api/debug/env` exposant des
  secrets, reset global via `JWT_SECRET` en query string, IDOR messagerie/IA — reporté
  en fin de chantier par choix.
