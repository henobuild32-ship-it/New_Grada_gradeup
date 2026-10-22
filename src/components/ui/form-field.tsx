'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface FormFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  /** Message d'erreur clair (affiché sous le champ, role="alert"). */
  error?: string;
  description?: string;
  required?: boolean;
}

/**
 * Champ de formulaire standard : label always visible, erreur inline,
 * inputMode adapté (numeric/tel/email) pour les bons claviers mobiles.
 * Les inputs sont en 16 px minimum (globals.css) : pas de zoom iOS.
 */
export const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, description, required, className, type = 'text', inputMode, ...props }, ref) => {
    const id = React.useId();
    const errorId = `${id}-error`;
    const descId = `${id}-desc`;

    const inferredInputMode =
      inputMode ??
      (type === 'email' ? 'email' : type === 'tel' ? 'tel' : type === 'number' ? 'numeric' : undefined);

    return (
      <div className={cn('space-y-1.5', className)}>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
          {required && <span className="text-red-500 ml-0.5" aria-hidden>*</span>}
        </Label>
        <Input
          ref={ref}
          id={id}
          type={type}
          inputMode={inferredInputMode}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : description ? descId : undefined}
          className={cn('min-h-11', error && 'border-red-500 focus-visible:ring-red-500')}
          {...props}
        />
        {description && !error && (
          <p id={descId} className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    );
  }
);
FormField.displayName = 'FormField';
