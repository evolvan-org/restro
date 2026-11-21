import { cn } from 'cn';
import { Check, Lock, Minus } from 'lucide-react';
import type { ReactElement } from 'react';

import type { CellLock } from './roles-model';

type Props = {
  checked: boolean;
  /** Differs from the saved state (unsaved edit). */
  changed: boolean;
  lock: CellLock;
  /** Shown on hover/focus when the cell is locked. */
  lockMessage: string;
  label: string;
  onToggle: () => void;
};

/** One role × permission cell: a checkbox, a read-only glyph, or a locked marker with a tooltip. */
export default function PermissionCell({
  checked,
  changed,
  lock,
  lockMessage,
  label,
  onToggle,
}: Props): ReactElement {
  if (lock === 'readonly') {
    return checked ? (
      <Check className="mx-auto size-4 text-foreground" aria-label={`${label}: granted`} />
    ) : (
      <Minus
        className="mx-auto size-4 text-muted-foreground"
        aria-label={`${label}: not granted`}
      />
    );
  }

  if (lock) {
    return (
      <span className="group relative mx-auto flex w-fit">
        <button
          type="button"
          aria-label={`${label}: locked. ${lockMessage}`}
          className="flex size-5 items-center justify-center rounded border border-dashed border-muted-foreground/50 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Lock className="size-3" />
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-60 -translate-x-1/2 rounded-md bg-foreground px-3 py-2 text-left text-xs text-background shadow-lg group-focus-within:block group-hover:block"
        >
          {lockMessage}
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        'mx-auto flex size-5 items-center justify-center rounded border outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? 'border-foreground bg-foreground text-background' : 'border-border bg-background',
        changed && 'ring-2 ring-orange-500 ring-offset-1',
      )}
    >
      {checked && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}
