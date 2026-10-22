import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground border-transparent',
  success: 'bg-emerald-100 text-emerald-700 border-transparent dark:bg-emerald-950/40 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 border-transparent dark:bg-amber-950/40 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 border-transparent dark:bg-red-950/40 dark:text-red-300',
  info: 'bg-blue-100 text-blue-700 border-transparent dark:bg-blue-950/40 dark:text-blue-300',
};

interface StatusBadgeProps {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}

/** Badge de statut standardisé (payé, en attente, actif…) avec contrastes clair/sombre. */
export function StatusBadge({ tone = 'neutral', children, className }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn('font-medium', toneClasses[tone], className)}>
      {children}
    </Badge>
  );
}

/** Mappe les statuts API courants de GradeUp sur un ton de badge. */
export function paymentStatusTone(status: string): StatusTone {
  switch (status) {
    case 'paid':
      return 'success';
    case 'pending':
      return 'warning';
    case 'overdue':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function presenceStatusTone(status: string): StatusTone {
  switch (status) {
    case 'PRESENT':
    case 'present':
      return 'success';
    case 'LATE':
    case 'late':
      return 'warning';
    case 'ABSENT':
    case 'absent':
      return 'danger';
    default:
      return 'neutral';
  }
}
