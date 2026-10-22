'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Liste de cartes responsive : équivalent mobile des tableaux de données.
 * Utilisation : chaque entité rend une carte via `renderCard`, les données
 * restant pilotées par le composant parent (mêmes filtres, mêmes actions).
 */

interface CardListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Clé stable par élément. */
  getKey: (item: T) => string;
  className?: string;
  /** Élément affiché quand la liste est vide (sinon rien). */
  empty?: React.ReactNode;
}

export function CardList<T>({ items, renderItem, getKey, className, empty }: CardListProps<T>) {
  if (items.length === 0 && empty) {
    return <>{empty}</>;
  }
  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item, index) => (
        <div
          key={getKey(item)}
          className="rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-blue-200 dark:hover:border-blue-900"
        >
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  );
}

/** Ligne label/valeur compacte pour l'intérieur d'une carte. */
export function CardListRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 text-sm', className)}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="truncate text-right font-medium">{children}</span>
    </div>
  );
}
