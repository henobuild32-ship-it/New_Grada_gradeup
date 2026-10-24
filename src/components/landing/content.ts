/**
 * Contenu textuel de la page d'accueil GradeUp.
 *
 * Tout le texte éditorial vit ici : on peut changer les mots sans toucher aux
 * composants. Règle absolue : aucun chiffre inventé, aucun logo client faux,
 * aucun témoignage non validé.
 */

export const site = {
  name: 'GradeUp',
  fullName: 'GradeUp ERP',
  version: 'v3.6',
  editor: 'Axion Labs Technologies',
  country: 'République démocratique du Congo',
  description:
    "GradeUp est l'outil de gestion scolaire des écoles de la RDC et d'Afrique francophone : classes, notes, bulletins, présences, frais scolaires et communication avec les parents.",
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://gradeup-trho.vercel.app',
  email: '',
  whatsapp: {
    label: '+243 845 072 349',
    href: 'https://wa.me/243845072349',
  },
  instagram: {
    label: '@axion_labs_technologies',
    href: 'https://instagram.com/axion_labs_technologies',
  },
  website: {
    label: 'axionlabstechnologies.netlify.app',
    href: 'https://axionlabstechnologies.netlify.app/',
  },
} as const;

/* 0. Barre d'annonce (fermable) */
export const announcement = {
  text: 'Nouveau : bulletins PDF et paiement du minerval par mobile money',
  href: '#fonctionnalites',
  cta: 'Découvrir',
};

/* 1. En-tête */
export const nav = {
  links: [
    { label: 'Fonctionnalités', href: '#fonctionnalites' },
    { label: 'Profils', href: '#profils' },
    { label: 'Tarifs', href: '#tarifs' },
    { label: 'FAQ', href: '#faq' },
    { label: 'Contact', href: '#contact' },
  ],
  login: 'Se connecter',
  demo: 'Demander une démo',
  register: 'Créer mon école',
} as const;

/* 2. Hero */
export const hero = {
  eyebrow: "Gestion scolaire pour les écoles de la RDC et d'Afrique francophone",
  titleA: 'Toute votre école,',
  titleB: 'dans un seul outil',
  titleHighlight: 'fiable.',
  subtitle:
    'Notes et bulletins, présences, frais scolaires et communication avec les parents : tout est au même endroit, sur téléphone comme sur ordinateur.',
  primaryCta: 'Créer mon école',
  secondaryCta: 'Voir comment ça marche',
  secondaryCtaHref: '#comment-ca-marche',
  joinLine: {
    prefix: 'Vous êtes parent, enseignant ou élève ?',
    link: 'Rejoignez votre école',
    href: '#profils',
  },
  reassurance: [
    { label: 'Données sécurisées' },
    { label: 'Fonctionne sur téléphone (PWA)' },
    { label: 'Utilisable avec une connexion lente' },
  ],
};

/* 3. Bande de confiance : engagements vérifiables, jamais de chiffres inventés */
export const trust = {
  items: [
    {
      title: 'Hébergement sécurisé',
      description: 'Connexion chiffrée et accès par rôle : chacun ne voit que ce qui le concerne.',
    },
    {
      title: 'Sauvegarde quotidienne',
      description: 'Les données de votre école sont sauvegardées chaque jour et restaurables.',
    },
    {
      title: 'Support WhatsApp',
      description: 'Une équipe humaine répond en français, du lundi au samedi.',
    },
  ],
};

/* 4. Problème → solution */
export const problems = {
  title: 'Ce qui prend du temps aujourd’hui, en moins de temps demain',
  intro:
    'Trois tâches que la plupart des écoles font encore sur papier ou dans un tableur.',
  items: [
    {
      before: 'Bulletins faits à la main',
      beforeDetail: 'Notes recopiées, moyennes recalculées, erreurs détectées trop tard.',
      after: 'Cahier de cotation calculé automatiquement',
      afterDetail: 'Moyennes pondérées, rang, mention et bulletin PDF prêts à publier.',
    },
    {
      before: 'Absences non communiquées',
      beforeDetail: 'Les parents l’apprennent à la fin du mois, ou jamais.',
      after: 'Présence pointée, parent prévenu',
      afterDetail: 'L’absence est enregistrée par le professeur et notifiée au parent.',
    },
    {
      before: 'Minerval suivi sur un cahier',
      beforeDetail: 'Impossible de savoir qui a payé, qui doit combien, à quel moment.',
      after: 'État des paiements à jour',
      afterDetail: 'Reçus, échéances et solde par élève, exportables à tout moment.',
    },
  ],
};

/* 5. Fonctionnalités (bento : 2 grandes + 6 petites) */
export const features = {
  id: 'fonctionnalites',
  eyebrow: 'Fonctionnalités',
  title: 'Les outils du quotidien, réunis',
  intro: 'Pas une liste de modules : les tâches que votre école fait vraiment chaque semaine.',
  large: [
    {
      key: 'grading' as const,
      icon: 'Sheet' as const,
      title: 'Cahier de cotation & bulletins',
      description:
        'Saisissez les notes une fois. Moyennes pondérées, rang, mention et bulletin PDF se calculent seuls.',
      bullets: ['Cotation par trimestre et par matière', 'Double validation avant publication', 'Bulletin PDF à imprimer'],
    },
    {
      key: 'finance' as const,
      icon: 'Wallet' as const,
      title: 'Finances & frais scolaires',
      description:
        'Suivez le minerval élève par élève : montant attendu, montant payé, reste dû, reçu remis.',
      bullets: ['Paiement mobile money', 'Reçus et états financiers', 'Relances par classe'],
    },
  ],
  small: [
    { icon: 'Users' as const, title: 'Classes & Élèves', description: 'Effectifs, dossiers et contacts en un endroit.' },
    { icon: 'CalendarCheck' as const, title: 'Présences', description: 'Pointage rapide par cours, alerte aux parents.' },
    { icon: 'CalendarDays' as const, title: 'Emploi du temps', description: 'Planning par classe et par enseignant.' },
    { icon: 'BookOpen' as const, title: 'Cours numériques', description: 'Leçons et ressources publiées pour les élèves.' },
    { icon: 'Bell' as const, title: 'Notifications', description: 'Annonces de l’école et messages internes.' },
    { icon: 'IdCard' as const, title: 'Cartes scolaires', description: 'Cartes d’identité d’élève générées et imprimables.' },
  ],
};

/* 6. Assistante Gradie */
export const gradie = {
  id: 'gradie',
  eyebrow: 'Assistant intégré',
  title: 'Gradie répond aux questions que vous posez déjà',
  intro:
    'Gradie lit les données de votre école (avec vos droits) et répond en français. Pas de promesse spectaculaire : des réponses utiles, tout de suite.',
  messages: [
    { role: 'user' as const, text: 'Quels élèves ont plus de 3 absences ce mois-ci ?' },
    { role: 'assistant' as const, text: 'Je peux résumer les absences dès que les données de présence de votre établissement sont disponibles.' },
    { role: 'user' as const, text: 'Calcule la moyenne de la 4e Humanités A en Maths.' },
    { role: 'assistant' as const, text: 'La moyenne est calculée à partir des notes, coefficients et règles de cotation de votre établissement.' },
    { role: 'user' as const, text: 'Qui n’a pas encore payé le minerval ?' },
    { role: 'assistant' as const, text: 'Je peux repérer les soldes à suivre et filtrer les résultats selon vos droits.' },
  ],
  prompts: ['Résume les absences de la semaine', 'Qui doit encore payer ?', 'Prépare le conseil de classe'],
  disclaimer: 'Gradie répond à partir des données auxquelles votre rôle a accès.',
};

/* 7. Parcours par profil */
export const profiles = {
  id: 'profils',
  eyebrow: 'Pour chaque profil',
  title: 'Un espace, trois choses à faire',
  tabs: [
    {
      key: 'admin' as const,
      label: 'Direction',
      tasks: [
        'Créer les classes et inscrire les élèves',
        'Suivre les paiements du minerval par classe',
        'Valider et publier les bulletins du trimestre',
      ],
      cta: 'Commencer',
      screen: 'dashboard' as const,
    },
    {
      key: 'teacher' as const,
      label: 'Enseignant',
      tasks: [
        'Encoder les notes depuis le cahier de cotation',
        'Pointer les présences en début de cours',
        'Publier les leçons et les devoirs',
      ],
      cta: 'Commencer',
      screen: 'grading' as const,
    },
    {
      key: 'parent' as const,
      label: 'Parent',
      tasks: [
        'Consulter les notes et le bulletin de votre enfant',
        'Suivre les paiements et les reçus',
        'Recevoir les absences et les annonces',
      ],
      cta: 'Commencer',
      screen: 'parent' as const,
    },
    {
      key: 'student' as const,
      label: 'Élève',
      tasks: [
        'Voir les cours, les devoirs et les notes',
        'Consulter le bulletin publié',
        'Recevoir les annonces de l’école',
      ],
      cta: 'Commencer',
      screen: 'grades' as const,
    },
  ],
};

/* 8. Comment ça marche */
export const steps = {
  id: 'comment-ca-marche',
  eyebrow: 'Démarrage',
  title: 'Opérationnel en trois étapes',
  intro: 'Vous pouvez créer votre école et inviter votre équipe le jour même.',
  duration: 'Prêt en moins d’une journée',
  items: [
    {
      step: '01',
      title: 'Créez votre école',
      description: 'Nom de l’école, année scolaire et rôles : direction, enseignants, parents, élèves.',
    },
    {
      step: '02',
      title: 'Ajoutez classes et élèves',
      description: 'Créez vos classes puis inscrivez vos élèves avec leur niveau, leur sexe et leur matricule.',
    },
    {
      step: '03',
      title: 'Invitez enseignants et parents',
      description: 'Chaque profil reçoit son code d’accès et rejoint l’école sans créer de compte supplémentaire.',
    },
  ],
};

/* 9. Application mobile (PWA) */
export const pwa = {
  id: 'application',
  eyebrow: 'Application mobile',
  title: 'Installez GradeUp sur le téléphone',
  intro:
    'Gradeup s’installe comme une application native sur Android et sur iPhone. L’icône apparaît sur l’écran d’accueil et l’interface s’ouvre en plein écran.',
  offline: 'En connexion instable, les pages déjà ouvertes restent consultables et les saisies sont synchronisées dès le retour du réseau.',
  light: 'L’application pèse quelques centaines de kilo-octettes : elle s’ouvre aussi sur un téléphone d’entrée de gamme.',
  stepsAndroid: [
    { title: 'Ouvrez le menu', description: 'Dans Chrome, touchez le menu à droite de la barre d’adresse.' },
    { title: 'Installer l’application', description: 'Choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».' },
    { title: 'Confirmez', description: 'L’icône GradeUp apparaît sur votre écran d’accueil.' },
  ],
  stepsIos: [
    { title: 'Ouvrez dans Safari', description: 'Partagez la page puis choisissez « Sur l’écran d’accueil ».' },
    { title: 'Ajoutez', description: 'Touchez « Ajouter » en haut à droite de l’écran.' },
    { title: 'Terminez', description: 'GradeUp s’ouvre en plein écran, comme une application.' },
  ],
  install: 'Installer l’application',
};

/* 10. Sécurité et confiance */
export const security = {
  id: 'securite',
  eyebrow: 'Sécurité',
  title: 'Les données des élèves ne sont pas un détail',
  intro: 'Quatre engagements, écrits simplement.',
  items: [
    { icon: 'ShieldCheck' as const, title: 'Rôles et permissions', description: 'Un élève voit ses notes, un parent ceux de ses enfants, la direction voit l’école.' },
    { icon: 'DatabaseBackup' as const, title: 'Sauvegarde quotidienne', description: 'Les données sont sauvegardées tous les jours et peuvent être restaurées.' },
    { icon: 'Lock' as const, title: 'Connexion chiffrée', description: 'Les échanges passent par une connexion HTTPS et des sessions expirent automatiquement.' },
    { icon: 'EyeOff' as const, title: 'Confidentialité', description: 'Aucune donnée d’élève n’est revendue ni utilisée à des fins publicitaires.' },
  ],
};

/* 11. Témoignages — affichés uniquement si des avis ont été validés */
export const testimonials = {
  id: 'temoignages',
  eyebrow: 'Avis vérifiés',
  title: 'Ce que disent les écoles',
  emptyPolicy: 'section-hidden-if-empty',
} as const;

/* 12. Tarifs / contact */
export const pricing = {
  id: 'tarifs',
  eyebrow: 'Parlons de votre école',
  title: 'Un tarif adapté à votre effectif',
  intro:
    'Le prix dépend du nombre d’élèves et des modules activés. Laissez vos coordonnées : nous vous répondons avec une proposition chiffrée.',
  contactFields: [
    { name: 'name', label: 'Votre nom', type: 'text', placeholder: 'Ex. Jean Kabeya', required: true },
    { name: 'school', label: 'École', type: 'text', placeholder: 'Ex. Lycée La Grâce', required: true },
    { name: 'phone', label: 'Téléphone', type: 'tel', placeholder: '+243 ...', required: true },
    { name: 'students', label: 'Effectif approximatif', type: 'number', placeholder: 'Ex. 450', required: false },
  ] as const,
  submit: 'Envoyer ma demande',
  whatsapp: 'Écrire sur WhatsApp',
  note: 'Réponse sous 24 h ouvrées.',
};

/* 13. FAQ */
export const faq = {
  id: 'faq',
  eyebrow: 'Questions fréquentes',
  title: 'Les réponses avant l’appel',
  items: [
    {
      q: 'Mes données sont-elles en sécurité ?',
      a: "Oui. La connexion est chiffrée (HTTPS), chaque compte a un rôle qui limite ce qu'il peut voir, et les données sont sauvegardées tous les jours. Vous pouvez exporter vos données à tout moment.",
    },
    {
      q: "GradeUp fonctionne-t-il sans internet ?",
      a: "Partiellement. L'application s'installe sur le téléphone, les pages déjà ouvertes restent consultables et les saisies faites hors connexion sont synchronisées dès le retour du réseau. La saisie de notes et la consultation des bulletins publiés continuent ainsi en zone à réseau instable.",
    },
    {
      q: 'Comment importer mes élèves existants ?',
      a: "Aujourd'hui, les classes et les élèves sont créés depuis l'espace direction, et la liste peut être exportée en CSV à tout moment. L'import direct d'un fichier Excel/CSV est en préparation : indiquez-le dans votre demande et nous vous préviendrons dès sa mise en service.",
    },
    {
      q: 'Comment se passe le paiement du minerval ?',
      a: 'Les paiements sont enregistrés dans l’application, avec un reçu et un historique par élève. Le paiement par mobile money est disponible selon l’opérateur configuré pour votre école.',
    },
    {
      q: 'Quel support est disponible ?',
      a: 'Un support en français par WhatsApp, du lundi au samedi. Nous accompagnons la mise en place initiale : création des classes, des années scolaires et la formation des enseignants.',
    },
    {
      q: 'Quelles langues sont prises en charge ?',
      a: "L'interface est actuellement en français. C'est la langue de travail de la majorité des écoles que nous accompagnons.",
    },
    {
      q: 'Combien ça coûte ?',
      a: "Le tarif dépend du nombre d'élèves et des modules activés. Laissez vos coordonnées dans le formulaire : nous envoyons une proposition chiffrée sous 24 h ouvrées.",
    },
    {
      q: 'Puis-je arrêter à tout moment ?',
      a: "Oui. Vous restez propriétaire de vos données : avant toute résiliation, vous pouvez exporter les élèves, les notes, les bulletins et les paiements. Aucun engagement n'est imposé au-delà de la période payée.",
    },
  ],
};

/* 14. Appel à l'action final */
export const finalCta = {
  title: 'Prêt à moderniser votre école ?',
  subtitle: 'Créez votre école en quelques minutes, ou demandez une démonstration avec votre équipe.',
  primary: 'Créer mon école',
  secondary: 'Se connecter',
  note: 'Sans carte bancaire.',
};

/* 15. Pied de page */
export type FooterLink = { label: string; href: string; external?: boolean };
export type FooterColumn = { title: string; links: FooterLink[] };

export const footer = {
  description:
    "GradeUp, l'outil de gestion scolaire des écoles de la RDC et d'Afrique francophone, édité par Axion Labs Technologies.",
  columns: [
    {
      title: 'Produit',
      links: [
        { label: 'Fonctionnalités', href: '#fonctionnalites' },
        { label: 'Profils', href: '#profils' },
        { label: 'Application mobile', href: '#application' },
        { label: 'Sécurité', href: '#securite' },
      ],
    },
    {
      title: 'Ressources',
      links: [
        { label: 'FAQ', href: '/faq' },
        { label: 'Comment ça marche', href: '#comment-ca-marche' },
        { label: 'Demander une démo', href: '#contact' },
      ],
    },
    {
      title: 'Entreprise',
      links: [{ label: 'Axion Labs Technologies', href: site.website.href, external: true }],
    },
    {
      title: 'Légal',
      links: [
        { label: 'Confidentialité', href: '/confidentialite' },
        { label: 'FAQ légale', href: '/faq' },
      ],
    },
  ] as FooterColumn[],
  contacts: [
    { label: 'WhatsApp', value: site.whatsapp.label, href: site.whatsapp.href, icon: 'MessageCircle' as const },
    { label: 'Instagram', value: site.instagram.label, href: site.instagram.href, icon: 'Instagram' as const },
    { label: 'Site web', value: site.website.label, href: site.website.href, icon: 'Globe' as const },
  ],
  rights: `© ${new Date().getFullYear()} ${site.fullName}. Tous droits réservés.`,
};

/* Métadonnées de partage */
export const seo = {
  title: 'GradeUp — Gestion scolaire pour les écoles de la RDC',
  description: site.description,
  keywords: ['gestion scolaire', 'école RDC', 'bulletin scolaire', 'cahier de cotation', 'minerval', 'GradeUp'],
};
