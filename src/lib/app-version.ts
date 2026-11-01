// App version — injectée par next.config.ts à chaque build.
// Chaque déploiement produit un identifiant unique, ce qui permet à la PWA
// de détecter qu'une nouvelle version est disponible.
export const APP_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION || '0.3.1';

// Libellé lisible affiché aux utilisateurs (notifications, dialogs).
export const APP_VERSION_LABEL = process.env.NEXT_PUBLIC_BUILD_VERSION_LABEL || `v${APP_VERSION}`;
