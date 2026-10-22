import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

/** Écran d'erreur standard avec bouton Réessayer. */
export function ErrorState({ title = 'Une erreur est survenue', description, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('text-center py-16', className)} role="alert">
      <div className="mx-auto w-24 h-24 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center mb-4">
        <AlertTriangle className="h-12 w-12 text-red-500/70" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      {description && <p className="text-muted-foreground mb-6 max-w-md mx-auto">{description}</p>}
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="gap-2 min-h-11">
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </Button>
      )}
    </div>
  );
}

interface ErrorBannerProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/** Bandeau d'erreur compact, à placer au-dessus d'un contenu qui reste affiché. */
export function ErrorBanner({ message = 'Impossible de charger les données.', onRetry, className }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3',
        className
      )}
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
      <p className="flex-1 text-sm text-red-700 dark:text-red-300">{message}</p>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="shrink-0 gap-1.5 min-h-11 border-red-200 dark:border-red-900/50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Réessayer
        </Button>
      )}
    </div>
  );
}
