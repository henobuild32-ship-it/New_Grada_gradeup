/**
 * Textes partagés de l'interface (français par défaut).
 * Point de départ de l'internationalisation : les écrans peuvent importer `fr`
 * directement ; un futur branchement next-intl remplacera uniquement `t()`.
 */

export const fr = {
  common: {
    loading: 'Chargement…',
    retry: 'Réessayer',
    save: 'Enregistrer',
    cancel: 'Annuler',
    confirm: 'Confirmer',
    delete: 'Supprimer',
    edit: 'Modifier',
    add: 'Ajouter',
    search: 'Rechercher…',
    searchPlaceholder: 'Rechercher…',
    clearSearch: 'Effacer la recherche',
    empty: 'Aucune donnée',
    errorTitle: 'Une erreur est survenue',
    errorLoad: 'Impossible de charger les données.',
    noResults: 'Aucun résultat',
    logout: 'Déconnexion',
    profile: 'Profil',
    more: 'Plus',
    moreTitle: 'Plus de modules',
    moreDescription: 'Tous les autres modules de GradeUp',
    themeLight: 'Mode clair',
    themeDark: 'Mode sombre',
    notifications: 'Notifications',
    messages: 'Messagerie',
    menu: 'Menu',
    back: 'Retour',
    next: 'Suivant',
    previous: 'Précédent',
    page: 'Page',
    of: 'sur',
    required: 'Ce champ est obligatoire.',
    invalidEmail: 'Adresse e-mail invalide.',
    weakPassword: 'Le mot de passe doit contenir au moins 8 caractères.',
    invalidPhone: 'Numéro de téléphone invalide.',
  },
  roles: {
    ADMIN: 'Administrateur',
    TEACHER: 'Professeur',
    STUDENT: 'Élève',
    PARENT: 'Parent',
  },
  nav: {
    home: 'Accueil',
    help: 'Aide',
  },
} as const;

export type Texts = typeof fr;

/** Accès type-safe aux textes. */
export function t(): Texts {
  return fr;
}
