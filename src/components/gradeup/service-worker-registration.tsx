'use client';

import { useEffect } from 'react';

/** Vérification périodique des mises à jour du service worker. */
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** Vrai si l'utilisateur est en train de saisir du texte (éviter de recharger). */
function isTyping(): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  return (
    active instanceof HTMLElement &&
    (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)
  );
}

/**
 * Enregistre le service worker de la PWA et applique automatiquement les
 * mises à jour :
 *  - `updateViaCache: 'none'` : le navigateur va toujours voir sw.js sur le réseau ;
 *  - `registration.update()` périodique + au retour sur l'onglet ;
 *  - `controllerchange` : le nouveau SW (skipWaiting) prend la main → rechargement
 *    automatique pour servir les nouveaux fichiers (sans écraser une saisie en cours).
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Capture AVANT l'enregistrement : à la toute première installation il n'y
    // a aucun contrôleur, inutile de recharger la page.
    const hadControllerBefore = !!navigator.serviceWorker.controller;

    let disposed = false;
    let refreshing = false;
    let pendingReload = false;
    let registration: ServiceWorkerRegistration | null = null;
    let intervalId: number | null = null;

    const reload = () => {
      if (refreshing || disposed) return;
      if (isTyping()) {
        // L'utilisateur écrit : on rechargera dès qu'il quitte le champ.
        pendingReload = true;
        return;
      }
      refreshing = true;
      window.location.reload();
    };

    const onControllerChange = () => {
      if (!hadControllerBefore || refreshing || disposed) return;
      reload();
    };

    const onFocusOut = () => {
      if (!pendingReload) return;
      pendingReload = false;
      window.setTimeout(reload, 400);
    };

    const checkForUpdate = () => {
      if (!registration) return;
      void registration.update().catch(() => {
        // Hors ligne : la prochaine vérification reprendra.
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('visibilitychange', onVisibilityChange);

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        if (disposed) return;
        registration = reg;
        checkForUpdate();
        intervalId = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
      })
      .catch((error: unknown) => {
        console.warn('[PWA] Service worker registration failed:', error);
      });

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
