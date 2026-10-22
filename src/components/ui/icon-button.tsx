import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type IconButtonProps = Omit<React.ComponentProps<typeof Button>, 'aria-label'> & {
  /** Obligatoire : bouton sans texte, l'étiquette est lue par les lecteurs d'écran. */
  label: string;
};

/**
 * Bouton icône accessible : taille tactile minimale de 44 px et aria-label requis.
 */
export function IconButton({ label, className, size = 'icon', ...props }: IconButtonProps) {
  return (
    <Button
      variant="ghost"
      size={size}
      aria-label={label}
      title={label}
      className={cn('min-h-11 min-w-11', className)}
      {...props}
    />
  );
}
