'use client';

// Compat : l'import historique `./ui-states` continue de fonctionner.
// Les composants vivent désormais dans le design system `@/components/ui`.
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { EmptyState as UiEmptyState } from '@/components/ui/empty-state';

export { ErrorBanner, ErrorState } from '@/components/ui/error-state';

/** Écran vide, variante historique (props actionLabel/onAction). */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <UiEmptyState
      icon={icon}
      title={title}
      description={description}
      action={
        actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {actionLabel}
          </button>
        ) : undefined
      }
    />
  );
}

/** Lignes de chargement simples (listes, tableaux). */
export function LoadingRows({ rows = 3, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-label="Chargement">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 rounded-xl bg-muted/60 animate-pulse" />
      ))}
      <span className="sr-only">Chargement…</span>
    </div>
  );
}

/** Icône + libellé pour un « aucun résultat » de recherche (compact). */
export function NoSearchResults({ label = 'Aucun résultat' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
      <Inbox className="h-10 w-10 mb-2 opacity-50" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
