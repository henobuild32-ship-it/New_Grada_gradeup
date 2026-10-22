/**
 * Baril de la couche offline (Dexie + outbox + repository + hooks).
 * À importer depuis `@/lib/offline` dans les modules.
 */
export * from './types';
export * from './db';
export * from './outbox';
export * from './repository';
export * from './storage';
// hooks sont 'use client' : réexport séparé pour éviter les problèmes SSR.
export * from './hooks';
