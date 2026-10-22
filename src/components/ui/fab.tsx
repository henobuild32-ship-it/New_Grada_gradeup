'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FabProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  className?: string;
}

/**
 * Bouton d'action flottant (mobile-first).
 * Se place en bas à droite, au-dessus de la bottom nav.
 */
export function Fab({ icon: Icon, label, onClick, className }: FabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'fixed z-40 right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+0.75rem)]',
        'h-14 w-14 rounded-full flex items-center justify-center',
        'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30',
        'hover:scale-105 active:scale-95 transition-transform',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        'lg:hidden',
        className
      )}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}
