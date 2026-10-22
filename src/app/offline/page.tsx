'use client';

import { CloudOff, RefreshCw } from 'lucide-react';

/**
 * Page de secours servie par le service worker quand une navigation échoue
 * hors ligne. Accessible aussi directement sur /offline.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center space-y-5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <CloudOff className="h-8 w-8 text-muted-foreground" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Vous êtes hors ligne</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          GradeUp n&apos;a pas pu charger cette page car aucune connexion n&apos;est disponible.
          Vos données déjà téléchargées restent accessibles dans l&apos;application installée.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Réessayer
        </button>
        <p className="text-xs text-muted-foreground">
          Astuce : installez GradeUp sur votre écran d&apos;accueil pour un accès hors ligne optimisé.
        </p>
      </div>
    </main>
  );
}
