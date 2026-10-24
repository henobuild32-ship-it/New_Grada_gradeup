'use client';

import { useEffect } from 'react';

/** Registers the PWA service worker after hydration without injecting an inline script. */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('[PWA] Service worker registration failed:', error);
    });
  }, []);

  return null;
}
