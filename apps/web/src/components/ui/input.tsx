'use client';

import { Input as InputPrimitive } from '@base-ui/react/input';
import { cn } from 'cn';
import * as React from 'react';

function Input({ className, type, onClick, ...props }: React.ComponentProps<'input'>) {
  const opensCalendar = type === 'date' || type === 'datetime-local';

  function openCalendar(event: React.MouseEvent<HTMLInputElement>): void {
    onClick?.(event);
    const input = event.currentTarget;
    if (
      event.defaultPrevented ||
      input.readOnly ||
      input.matches(':disabled') ||
      typeof input.showPicker !== 'function'
    ) {
      return;
    }

    try {
      input.showPicker();
    } catch (error) {
      // Restricted contexts can reject showPicker. Let the native click proceed.
      if (!(error instanceof DOMException)) throw error;
    }
  }

  return (
    <InputPrimitive
      type={type}
      onClick={opensCalendar ? openCalendar : onClick}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
