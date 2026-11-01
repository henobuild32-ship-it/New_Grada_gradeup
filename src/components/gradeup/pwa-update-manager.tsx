'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { APP_VERSION, APP_VERSION_LABEL } from '@/lib/app-version';

const VERSION_KEY = 'gradeup-app-version';

/**
 * Complément de `ServiceWorkerRegistration` :
 *  - signale à l'utilisateur qu'une nouvelle version a été installée ;
 *  - propose une mise à jour manuelle si un worker reste en attente
 *    (cas limite : le rechargement automatique a été différé).
 *
 * En fonctionnement normal, la mise à jour est appliquée automatiquement par
 * `controllerchange` (skipWaiting + rechargement guardé).
 */
export default function PWAUpdateManager() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [available, setAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(0);

  const showUpdateNotification = useCallback(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker.ready
        .then((serviceWorkerRegistration) => serviceWorkerRegistration.showNotification('Nouvelle mise à jour GradeUp', {
          body: `GradeUp ${APP_VERSION_LABEL} est disponible ! Cliquez pour mettre à jour.`,
          icon: '/icon-192x192.png',
          badge: '/icon-192x192.png',
          tag: 'gradeup-update',
          requireInteraction: true,
          data: { url: '/' },
        }))
        .catch(() => {
          // Le dialog in-app reste disponible si l'OS refuse la notification.
        });
    }
  }, []);

  // Confirme (discrètement) que la PWA tourne sur la dernière version buildée.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VERSION_KEY);
      if (stored === APP_VERSION) return;
      localStorage.setItem(VERSION_KEY, APP_VERSION);
      if (stored) {
        toast.success(`GradeUp ${APP_VERSION_LABEL} est à jour`, {
          description: 'La dernière version vient d’être installée.',
          duration: 4000,
        });
      }
    } catch {
      // Stockage indisponible (mode privé) : la mise à jour reste automatique.
    }
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      setRegistration(reg);

      // Un worker en attente = mise à jour téléchargée mais pas encore active.
      const offerWaiting = () => {
        if (reg.waiting) {
          setAvailable(true);
          showUpdateNotification();
        }
      };

      offerWaiting();

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') offerWaiting();
        });
      });

      void reg.update();
    } catch {
      // Service worker non supporté : rien à proposer.
    }
  }, [showUpdateNotification]);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => void checkForUpdate(), 0);
    const timer = window.setInterval(() => void checkForUpdate(), 30 * 60 * 1000);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(timer);
    };
  }, [checkForUpdate]);

  const applyUpdate = async () => {
    setUpdating(true);
    // Barre de progression (5 s) le temps que le nouveau worker prenne la main.
    const started = Date.now();
    await new Promise<void>((resolve) => {
      const timer = window.setInterval(() => {
        const next = Math.min(100, Math.round(((Date.now() - started) / 5000) * 100));
        setProgress(next);
        if (next >= 100) {
          window.clearInterval(timer);
          resolve();
        }
      }, 80);
    });
    try {
      localStorage.setItem(VERSION_KEY, APP_VERSION);
    } catch {
      // Stockage indisponible : sans impact sur la mise à jour.
    }
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  };

  const handleDismiss = () => {
    setAvailable(false);
  };

  return (
    <Dialog open={available} onOpenChange={(open) => !updating && setAvailable(open)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-600" />
            Nouvelle mise à jour disponible
          </DialogTitle>
          <DialogDescription>
            GradeUp {APP_VERSION_LABEL} est prêt à être installé.
          </DialogDescription>
        </DialogHeader>
        {updating ? (
          <div className="space-y-3 py-4">
            <p className="text-sm font-semibold text-center">Mise à jour en cours : {progress}%</p>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-[width] duration-100 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Ne fermez pas cette page pendant la mise à jour...
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Corrections de bugs et nouvelles fonctionnalités</span>
            </div>
            <Button onClick={applyUpdate} className="w-full gap-2">
              <RefreshCw className="h-4 w-4" />
              Mettre à jour maintenant
            </Button>
            <Button onClick={handleDismiss} variant="ghost" className="w-full" size="sm">
              Plus tard
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
