'use client';

import { cn } from 'cn';
import type { InputHTMLAttributes, ReactElement, ReactNode } from 'react';

/*
 * The onboarding design's primitives (prototype "Photo to Restaurant" / canvas boards), mapped to
 * the app's theme tokens: background / muted / border / foreground / primary, plus indigo (AI),
 * emerald (ok), amber (watch) and red (problem) with dark-mode pairs. 0.45rem radius, 44px controls.
 */

export function Card({
  className,
  children,
  as: Tag = 'div',
}: {
  className?: string;
  children: ReactNode;
  as?: 'div' | 'section' | 'aside';
}): ReactElement {
  return (
    <Tag className={cn('rounded-[10px] border border-border bg-card', className)}>{children}</Tag>
  );
}

export type Tone = 'neutral' | 'ai' | 'ok' | 'warn' | 'bad' | 'edit' | 'est' | 'real';

const CHIP: Record<Tone, string> = {
  neutral: 'border-zinc-300 bg-muted text-foreground dark:border-zinc-700',
  ai: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  warn: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  bad: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  edit: 'border-dashed border-zinc-400 bg-background text-foreground',
  est: 'border-dashed border-amber-700 bg-amber-50 text-amber-800 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-300',
  real: 'border-emerald-700 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-300',
};

export function Chip({
  tone = 'neutral',
  small = false,
  className,
  children,
}: {
  tone?: Tone;
  small?: boolean;
  className?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center gap-1 rounded-full border font-semibold whitespace-nowrap [&_svg]:size-3',
        small ? 'h-[18px] px-1.5 text-[10.5px]' : 'h-[22px] px-2 text-xs',
        CHIP[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const ALERT: Record<'neutral' | 'ai' | 'ok' | 'warn' | 'bad', string> = {
  neutral: 'border-border bg-muted',
  ai: 'border-indigo-200 bg-indigo-50 text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-100',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100',
  warn: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-100',
  bad: 'border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/60 dark:text-red-100',
};

export function Alert({
  tone = 'neutral',
  icon,
  action,
  className,
  role,
  children,
}: {
  tone?: keyof typeof ALERT;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  role?: 'status' | 'alert';
  children: ReactNode;
}): ReactElement {
  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-2.5 rounded-[9px] border px-3.5 py-3 text-[13.5px] leading-snug [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:flex-none',
        action && 'items-center',
        ALERT[tone],
        className,
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

/** Small uppercase label used above stats ("PLATE COST"). */
export function Tag({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <span
      className={cn(
        'text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }): ReactElement {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-b-2 border-zinc-300 bg-muted px-1 font-sans text-[11px] font-semibold text-foreground dark:border-zinc-600">
      {children}
    </kbd>
  );
}

export function KeyHint({
  keyLabel,
  children,
}: {
  keyLabel: string;
  children: ReactNode;
}): ReactElement {
  return (
    <span className="hidden items-center gap-2 text-[12.5px] text-muted-foreground sm:inline-flex">
      <Kbd>{keyLabel}</Kbd>
      {children}
    </span>
  );
}

/** Filter pills ("Needs attention · 8", "All 66"). */
export function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}): ReactElement {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex h-[26px] items-center rounded-full border px-2.5 text-[12.5px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600',
            value === option.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-zinc-300 bg-background hover:bg-muted dark:border-zinc-700',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Screen heading: title, one line of help, optional chips/controls on the right. */
export function PageHead({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2.5">{right}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = 'neutral',
  label,
  className,
}: {
  value: number;
  tone?: 'neutral' | 'ai';
  label: string;
  className?: string;
}): ReactElement {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cn('h-2 overflow-hidden rounded-full bg-border', className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <i
        className={cn(
          'block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none',
          tone === 'ai' ? 'bg-indigo-700 dark:bg-indigo-400' : 'bg-primary',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** A labelled number card ("AVERAGE FOOD COST 33%"). */
export function Stat({
  label,
  value,
  children,
  className,
}: {
  label: string;
  value?: ReactNode;
  children?: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <Card className={cn('p-4', className)}>
      <Tag>{label}</Tag>
      {value !== undefined && (
        <div className="mt-1.5 text-[34px] leading-tight font-bold tabular-nums">{value}</div>
      )}
      {children}
    </Card>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Grid tables (the design's .tbl / .th / .tr): one grid template shared by header and rows.
 * ------------------------------------------------------------------------------------------- */

export function GridTable({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className={cn('overflow-x-auto rounded-[10px] border border-border bg-card', className)}>
      <div role="table" aria-label={label} className="min-w-fit">
        {children}
      </div>
    </div>
  );
}

export function GridHead({ cols, children }: { cols: string; children: ReactNode }): ReactElement {
  return (
    <div
      role="row"
      className="grid h-[38px] items-center gap-x-3 border-b border-border bg-muted px-3.5 text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase [&>*]:min-w-0"
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}

export type RowTone = 'default' | 'problem' | 'out' | 'new' | 'selected';

export function GridRow({
  cols,
  tone = 'default',
  className,
  children,
}: {
  cols: string;
  tone?: RowTone;
  className?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      role="row"
      className={cn(
        'grid min-h-[52px] items-center gap-x-3 border-b border-border px-3.5 py-1.5 last:border-b-0 [&>*]:min-w-0',
        tone === 'problem' && 'bg-amber-50 dark:bg-amber-950/40',
        tone === 'out' && 'opacity-60',
        tone === 'new' && 'bg-indigo-50 dark:bg-indigo-950/50',
        tone === 'selected' && 'outline-2 -outline-offset-2 outline-foreground',
        className,
      )}
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}

/** An editable value that reads like table text (dotted underline), an input on focus. */
export function CellInput({
  className,
  invalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }): ReactElement {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cn(
        '-mx-2 h-9 w-[calc(100%+1rem)] min-w-0 rounded-md border border-transparent border-b-zinc-300 border-dotted bg-transparent px-2 text-sm text-ellipsis outline-none hover:border-zinc-300 focus:border-solid focus:border-foreground focus:bg-background focus:shadow-[0_0_0_3px_var(--border)] dark:border-b-zinc-700',
        invalid && 'border-b-red-500 border-solid',
        className,
      )}
    />
  );
}

/** Select styled like the design's inputs (.inp). */
export function CellSelect({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>): ReactElement {
  return (
    <select
      {...props}
      className={cn(
        'h-9 rounded-md border border-zinc-300 bg-background px-2 text-sm outline-none focus:border-foreground focus:shadow-[0_0_0_3px_var(--border)] dark:border-zinc-700',
        className,
      )}
    >
      {children}
    </select>
  );
}

/** Design's checkbox square (selection / included). */
export function CheckSquare({ on, label }: { on: boolean; label?: string }): ReactElement {
  return (
    <span
      role="img"
      aria-label={label ?? (on ? 'Included' : 'Not included')}
      className={cn(
        'inline-flex size-[18px] flex-none items-center justify-center rounded-[5px] border-[1.5px]',
        on ? 'border-primary bg-primary text-primary-foreground' : 'border-zinc-300 bg-background',
      )}
    >
      {on && (
        <svg
          viewBox="0 0 24 24"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          aria-hidden
        >
          <path d="M5 12l5 5L20 7" />
        </svg>
      )}
    </span>
  );
}

/** Button looks from the design (.btn, .btn.pri, .btn.ai, .btn.gh, .btn.sm). */
export function btn(
  variant: 'default' | 'primary' | 'ai' | 'ghost' = 'default',
  size: 'md' | 'sm' | 'lg' = 'md',
): string {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-[7.2px] border font-medium whitespace-nowrap transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:size-4 [&_svg]:flex-none',
    size === 'sm'
      ? 'h-8 px-3 text-[13px]'
      : size === 'lg'
        ? 'h-12 px-6 text-sm'
        : 'h-11 px-[18px] text-sm',
    variant === 'primary' &&
      'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
    variant === 'ai' &&
      'border-indigo-700 bg-indigo-700 text-white hover:bg-indigo-800 dark:border-indigo-400 dark:bg-indigo-400 dark:text-indigo-950',
    variant === 'ghost' && 'border-transparent bg-transparent hover:bg-muted',
    variant === 'default' && 'border-zinc-300 bg-background hover:bg-muted dark:border-zinc-700',
  );
}

/** The design's segmented control (.seg): tablist semantics, arrow keys move and select. */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  fill = false,
}: {
  options: readonly { value: T; label: ReactNode; ai?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  fill?: boolean;
}): ReactElement {
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const index = options.findIndex((option) => option.value === value);
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = options[(index + step + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    (
      event.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLButtonElement | null
    )?.focus();
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[9px] border border-zinc-300 bg-muted p-[3px] dark:border-zinc-700',
        fill && 'flex w-full',
        className,
      )}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            data-value={option.value}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-[38px] items-center justify-center gap-[7px] rounded-[7px] border px-4 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600',
              fill && 'flex-1',
              on
                ? 'border-border bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,.12)]'
                : 'border-transparent text-muted-foreground',
            )}
          >
            {option.label}
            {option.ai && (
              <Chip tone="ai" small>
                AI
              </Chip>
            )}
          </button>
        );
      })}
    </div>
  );
}
