import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  Serwist,
  NetworkOnly,
  NetworkFirst,
  StaleWhileRevalidate,
  CacheFirst,
  ExpirationPlugin,
  CacheableResponsePlugin,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: any;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // 1) API de lecture : NetworkFirst (frais si en ligne, cache si hors ligne).
    {
      matcher: ({ request }) => request.method === 'GET' && request.url.includes('/api/'),
      handler: new NetworkFirst({
        cacheName: 'gradeup-api-cache',
        networkTimeoutSeconds: 4,
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 7 * 24 * 3600 }),
        ],
      }),
    },
    // 2) Écritures : jamais mises en cache (l'outbox gère l'offline).
    {
      matcher: ({ request }) => request.method !== 'GET' && request.url.includes('/api/'),
      handler: new NetworkOnly(),
    },
    // 3) Fichiers lourds (PDF, supports de cours) : cache à la demande (CacheFirst).
    {
      matcher: ({ request }) =>
        request.destination === 'document' === false &&
        (request.url.includes('/uploads/') ||
          request.url.includes('/api/upload/') ||
          /\.(pdf|docx?|xlsx?|pptx?|zip)$/i.test(request.url)),
      handler: new CacheFirst({
        cacheName: 'gradeup-files-cache',
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 30 * 24 * 3600 }),
        ],
      }),
    },
    // 4) Images : cache avec limite de taille + expiration.
    {
      matcher: ({ request }) => request.destination === 'image',
      handler: new StaleWhileRevalidate({
        cacheName: 'gradeup-images-cache',
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 14 * 24 * 3600 }),
        ],
      }),
    },
    // 5) Fonts / assets statiques : cacheFirst.
    {
      matcher: ({ request }) => request.destination === 'font' || request.destination === 'style',
      handler: new CacheFirst({
        cacheName: 'gradeup-assets-cache',
        plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 3600 })],
      }),
    },
    // 6) Pages (navigations) : NetworkFirst avec fallback offline via precache.
    {
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkFirst({
        cacheName: 'gradeup-pages-cache',
        networkTimeoutSeconds: 3,
        plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * 24 * 3600 })],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

// --- Fallback hors ligne : servir /offline pour les navigations échouées ---
self.addEventListener('fetch', (event: any) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open('gradeup-pages-cache');
        const cached = await cache.match('/offline');
        if (cached) return cached;
        return new Response(
          '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hors ligne – GradeUp</title><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}main{text-align:center;padding:2rem}h1{font-size:1.5rem}p{color:#94a3b8}</style></head><body><main><h1>Vous êtes hors ligne</h1><p>GradeUp n&apos;a pas pu charger cette page. Vérifiez votre connexion puis réessayez.</p><button onclick="location.reload()" style="margin-top:1rem;padding:.6rem 1.2rem;border:0;border-radius:.5rem;background:#3b82f6;color:#fff;font-size:1rem">Réessayer</button></main></body></html>',
          { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } }
        );
      }
    })()
  );
});

// --- Background Sync : pousser l'outbox quand le réseau revient ---
self.addEventListener('sync', (event: any) => {
  if (event.tag === 'gradeup-outbox') {
    event.waitUntil(notifyClients({ type: 'SYNC_OUTBOX' }));
  }
});

self.addEventListener('message', (event: any) => {
  if (event.data?.type === 'SYNC_OUTBOX') {
    event.waitUntil(notifyClients({ type: 'SYNC_OUTBOX' }));
  }
});

function notifyClients(message: any) {
  return self.clients.matchAll({ type: 'window' }).then((clients: any) => {
    clients.forEach((client: any) => client.postMessage(message));
  });
}

// --- Native Web Push Notification Listeners (works when site/PWA is closed) ---

self.addEventListener("push", (event: any) => {
  try {
    let data: any = {};
    if (event.data) {
      try {
        data = event.data.json();
      } catch {
        data = { body: event.data.text() };
      }
    }

    const title = data.title || "GradeUp";
    const options = {
      body: data.body || "Nouvelle notification de GradeUp.",
      icon: data.icon || "/icon-192x192.png",
      badge: data.badge || "/icon-192x192.png",
      vibrate: [200, 100, 200],
      renotify: true,
      tag: data.tag || "gradeup-notification",
      requireInteraction: true,
      data: data.data || { url: "/" },
      actions: [
        { action: "open", title: "Ouvrir" },
        { action: "dismiss", title: "Fermer" }
      ],
      silent: false,
    };

    event.waitUntil(
      self.registration.showNotification(title, options).then(() => {
        return self.clients.matchAll({ type: "window" }).then((clients: any) => {
          clients.forEach((client: any) => {
            client.postMessage({ type: "PUSH_NOTIFICATION_RECEIVED", data });
          });
        });
      })
    );
  } catch (error) {
    console.error("[SW] Push notification error:", error);
  }
});

self.addEventListener("notificationclick", (event: any) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const urlToOpen = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients: any) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ("focus" in client) {
          client.focus();
          if (client.navigate) return client.navigate(urlToOpen);
          return client;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(urlToOpen);
    })
  );
});

self.addEventListener("notificationclose", () => {
  // Analytics optionnelle.
});
