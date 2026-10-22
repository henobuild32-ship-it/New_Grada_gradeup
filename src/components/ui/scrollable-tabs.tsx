'use client';

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type ScrollableTabsProps = React.ComponentProps<typeof Tabs> & {
  listClassName?: string;
};

/**
 * Onglets avec liste défilante horizontalement (mobile : swipe naturel).
 * Enchaîne les APIs de Tabs shadcn pour rester familier.
 */
export function ScrollableTabs({ listClassName, className, ...props }: ScrollableTabsProps) {
  return (
    <Tabs className={cn('w-full', className)} {...props}>
      <TabsList
        className={cn(
          'w-full justify-start overflow-x-auto overscroll-x-contain flex-nowrap',
          'scrollbar-none [&::-webkit-scrollbar]:hidden',
          listClassName
        )}
      >
        {React.Children.map(props.children, (child) => {
          if (React.isValidElement(child) && child.type === TabsTrigger) {
            return React.cloneElement(child as React.ReactElement<React.ComponentProps<typeof TabsTrigger>>, {
              className: cn('shrink-0 whitespace-nowrap', (child.props as { className?: string }).className),
            });
          }
          return child;
        })}
      </TabsList>
      {React.Children.map(props.children, (child) => {
        if (React.isValidElement(child) && child.type === TabsContent) {
          return child;
        }
        return null;
      })}
    </Tabs>
  );
}

export { TabsContent, TabsTrigger };
