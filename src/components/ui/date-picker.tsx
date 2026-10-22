'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  /** Date ISO (yyyy-MM-dd) ou vide. */
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/**
 * Sélecteur de date (Popover + calendar) avec affichage français.
 * Émet une chaîne ISO pour rester compatible avec les <input type="date"> existants.
 */
export function DatePicker({ value, onValueChange, placeholder = 'Choisir une date', disabled, className, id }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start gap-2 font-normal min-h-11 text-left',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {selected ? format(selected, 'dd MMMM yyyy', { locale: fr }) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => {
            onValueChange(day ? format(day, 'yyyy-MM-dd') : '');
            setOpen(false);
          }}
          locale={fr}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
