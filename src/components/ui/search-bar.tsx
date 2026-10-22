'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';

interface SearchBarProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

/** Barre de recherche avec icône et bouton d'effacement (cible ≥ 44 px). */
export function SearchBar({ value, onValueChange, className, placeholder = 'Rechercher…', ...props }: SearchBarProps) {
  return (
    <div className={cn('relative w-full', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={cn('pl-9 pr-11 min-h-11', value && 'pr-11')}
        {...props}
      />
      {value && (
        <IconButton
          label="Effacer la recherche"
          onClick={() => onValueChange('')}
          className="absolute right-0.5 top-1/2 -translate-y-1/2 h-10 w-10"
        >
          <X className="h-4 w-4" />
        </IconButton>
      )}
    </div>
  );
}
