'use client';

import type { AiJob, AiJobErrorCode } from '@rms/api-contract';
import { cn } from 'cn';
import {
  Clock,
  Eye,
  FileText,
  Layers,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  Wifi,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { btn, Card } from '@/containers/Onboarding/ui/kit';

export type AiFailureKind = AiJobErrorCode | 'QUOTA' | 'OFFLINE';

type Copy = {
  title: (noun: string) => string;
  body: (noun: string) => string;
  icon: ReactElement;
  tone: 'bad' | 'warn';
};

const COPY: Record<AiFailureKind, Copy> = {
  UNREADABLE: {
    title: () => "We can't read this photo",
    body: (noun) =>
      `The page is out of focus, too dark, or its text is too small or crowded to read every price with certainty, so we stopped before reading it. Retake it closer, flat and well lit, one section per photo if the ${noun} is busy. Nothing was added to your draft.`,
    icon: <Eye aria-hidden />,
    tone: 'bad',
  },
  NOT_A_MENU: {
    title: () => "This doesn't look like a menu",
    body: () =>
      "We didn't find a real menu with dishes and prices. Design templates and sample menus with placeholder text or 0.00 prices aren't read. If it's a supplier invoice, scan it in the Inventory step instead.",
    icon: <FileText aria-hidden />,
    tone: 'warn',
  },
  NOT_AN_INVOICE: {
    title: () => "This doesn't look like an invoice",
    body: () =>
      'We found no item lines with amounts. If it is your menu, scan it in the Menu step instead.',
    icon: <FileText aria-hidden />,
    tone: 'warn',
  },
  AI_UNAVAILABLE: {
    title: () => 'AI is unavailable right now',
    body: () =>
      "We couldn't reach the reading service. Your pages and every row so far are saved. Switch to CSV or manual entry and keep going, or try again in a minute.",
    icon: <Wifi aria-hidden />,
    tone: 'bad',
  },
  INVALID_OUTPUT: {
    title: () => "We couldn't make sense of this read",
    body: () => 'Nothing was added to your draft. Try again, or add items another way.',
    icon: <TriangleAlert aria-hidden />,
    tone: 'warn',
  },
  CANCELLED: {
    title: () => 'Reading stopped',
    body: () => 'Rows read so far are kept in your draft.',
    icon: <TriangleAlert aria-hidden />,
    tone: 'warn',
  },
  INTERRUPTED: {
    title: () => 'Reading was interrupted',
    body: () => 'Rows read so far are kept. Start a new scan for the rest.',
    icon: <TriangleAlert aria-hidden />,
    tone: 'warn',
  },
  QUOTA: {
    title: () => "You've used today's scans",
    body: (noun) =>
      `This restaurant has used today's ${noun} scans. They reset at midnight. Your draft is safe, and CSV and manual entry still work.`,
    icon: <Clock aria-hidden />,
    tone: 'warn',
  },
  OFFLINE: {
    title: () => 'Upload is paused',
    body: () => "You're offline. Your photos are kept; the upload continues when you reconnect.",
    icon: <Wifi aria-hidden />,
    tone: 'warn',
  },
};

function IconTile({ tone, children }: { tone: 'bad' | 'warn'; children: ReactNode }): ReactElement {
  return (
    <span
      className={cn(
        'flex size-10 flex-none items-center justify-center rounded-[10px] border [&_svg]:size-5',
        tone === 'bad'
          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
          : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
      )}
    >
      {children}
    </span>
  );
}

/** Failure state card (board "Menu scan: failure states"): keeps work, offers a way forward. */
export function AiFailureState({
  kind,
  noun,
  actions,
  extra,
}: {
  kind: AiFailureKind;
  noun: string;
  actions: ReactNode;
  extra?: ReactNode;
}): ReactElement {
  const copy = COPY[kind];
  return (
    <Card as="section" className="flex max-w-[560px] flex-col gap-3 p-5">
      <div role="alert" className="flex items-center gap-3">
        <IconTile tone={copy.tone}>{copy.icon}</IconTile>
        <h2 className="text-base font-semibold">{copy.title(noun)}</h2>
      </div>
      <p className="text-[13.5px] leading-normal text-muted-foreground">{copy.body(noun)}</p>
      {extra}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </Card>
  );
}

/** "We read 3 of 4 pages" (failure-states board, partial read). */
export function PartialReadBanner({
  job,
  onRetake,
  onContinue,
}: {
  job: AiJob;
  onRetake: (page: number) => void;
  onContinue?: () => void;
}): ReactElement | null {
  const failed = job.pages.filter((page) =>
    ['unreadable', 'failed', 'not_document'].includes(page.status),
  );
  if (!failed.length) return null;
  const read = job.pages.length - failed.length;
  return (
    <Card as="section" className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3" role="status">
        <IconTile tone="warn">
          <Layers aria-hidden />
        </IconTile>
        <h2 className="text-base font-semibold">
          We read {read} of {job.pages.length} pages
        </h2>
      </div>
      <p className="text-[13.5px] text-muted-foreground">
        {failed.map((page) => `Page ${page.page}`).join(', ')} couldn&apos;t be read. Everything
        from the other pages is in your draft. Retake {failed.length === 1 ? 'it' : 'them'} to fill
        the gap.
      </p>
      <div className="flex flex-wrap gap-2">
        {failed.map((page) => (
          <button
            key={page.page}
            type="button"
            className={btn('primary', 'sm')}
            onClick={() => onRetake(page.page)}
          >
            <RotateCcw aria-hidden />
            Retake page {page.page}
          </button>
        ))}
        {onContinue && (
          <button type="button" className={btn('default', 'sm')} onClick={onContinue}>
            Continue without {failed.length === 1 ? 'it' : 'them'}
          </button>
        )}
      </div>
    </Card>
  );
}

/** Floating progress pill (design .fab) that follows the owner while a job runs. */
export function FloatingAiProgress({ label }: { label: ReactNode }): ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 bottom-[88px] z-30 flex h-11 items-center gap-2.5 rounded-full bg-primary pr-4 pl-3 text-[13px] font-semibold text-primary-foreground shadow-[0_8px_24px_rgba(0,0,0,.25)] sm:right-6"
    >
      <Sparkles className="size-4" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
