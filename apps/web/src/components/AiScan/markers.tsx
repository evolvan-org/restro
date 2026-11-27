import {
  confidenceLevel,
  COST_BAND_LABELS,
  type CostBand,
  DIET_TYPE_LABELS,
  type DietType,
} from '@rms/api-contract';
import { cn } from 'cn';
import { CircleCheck, Contrast, Pencil, Receipt, Sparkles, TriangleAlert, X } from 'lucide-react';
import type { ReactElement } from 'react';

import { Chip } from '@/containers/Onboarding/ui/kit';

/*
 * Trust language, the same everywhere (board "Components: trust, cost, match"): AI-suggested
 * (sparkle), low confidence (triangle), edited by you (pencil, dashed), approved (filled tick);
 * estimated price (≈, dashed) vs from invoice (receipt, solid). Never colour alone.
 */

export function AiSuggestedChip({
  label = 'AI-suggested',
  small,
}: {
  label?: string;
  small?: boolean;
}): ReactElement {
  return (
    <Chip tone="ai" small={small}>
      <Sparkles aria-hidden />
      {label}
    </Chip>
  );
}

export function EditedChip({
  label = 'Edited by you',
  small,
}: {
  label?: string;
  small?: boolean;
}): ReactElement {
  return (
    <Chip tone="edit" small={small}>
      <Pencil aria-hidden />
      {label}
    </Chip>
  );
}

export function ApprovedChip({
  label = 'Approved',
  small,
}: {
  label?: string;
  small?: boolean;
}): ReactElement {
  return (
    <Chip tone="ok" small={small}>
      <CircleCheck aria-hidden />
      {label}
    </Chip>
  );
}

export function LowConfidenceChip({
  label = 'Low confidence',
  small,
}: {
  label?: string;
  small?: boolean;
}): ReactElement {
  return (
    <Chip tone="bad" small={small}>
      <TriangleAlert aria-hidden />
      {label}
    </Chip>
  );
}

export function PriceSourceChip({
  source,
  small,
  label,
}: {
  source: 'estimated' | 'invoice' | 'manual' | 'none';
  small?: boolean;
  label?: string;
}): ReactElement {
  if (source === 'invoice') {
    return (
      <Chip tone="real" small={small}>
        <Receipt aria-hidden />
        {label ?? 'From invoice'}
      </Chip>
    );
  }
  if (source === 'manual') return <EditedChip label={label ?? 'Entered by you'} small={small} />;
  if (source === 'none') return <Chip small={small}>{label ?? 'No price yet'}</Chip>;
  return (
    <Chip tone="est" small={small}>
      <span aria-hidden>≈</span>
      {label ?? 'Estimated market price'}
    </Chip>
  );
}

/** 90+ high, 75–89 medium, below 75 low ("Check"). Always icon + number (design .cb). */
export function ConfidenceBadge({ value }: { value: number }): ReactElement {
  const level = confidenceLevel(value);
  const base =
    'inline-flex h-[22px] flex-none items-center gap-1 rounded-md border px-[7px] text-xs font-semibold tabular-nums [&_svg]:size-[13px]';
  if (level === 'high') {
    return (
      <span
        className={cn(
          base,
          'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
        )}
      >
        <CircleCheck aria-hidden />
        {value}%<span className="sr-only"> confidence, high</span>
      </span>
    );
  }
  if (level === 'medium') {
    return (
      <span
        className={cn(
          base,
          'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
        )}
      >
        <Contrast aria-hidden />
        {value}%<span className="sr-only"> confidence, medium</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        'border-red-700 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300',
      )}
    >
      <TriangleAlert aria-hidden />
      {value}% · Check
    </span>
  );
}

const DIET_COLOR: Record<DietType, string> = { VEG: '#16803c', NON_VEG: '#b3261e', EGG: '#b45309' };

/** Indian food marker in a square: veg circle, non-veg triangle, egg ring; plus the word. */
export function DietMarker({
  diet,
  showLabel = true,
  size = 16,
}: {
  diet: DietType | null | undefined;
  showLabel?: boolean;
  size?: number;
}): ReactElement {
  if (!diet) return <span className="text-xs text-muted-foreground">Not set</span>;
  const color = DIET_COLOR[diet];
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="img"
        aria-label={DIET_TYPE_LABELS[diet]}
        className="flex-none"
      >
        <rect
          x="2.5"
          y="2.5"
          width="19"
          height="19"
          rx="3"
          fill="#fff"
          stroke={color}
          strokeWidth="2"
        />
        {diet === 'VEG' && <circle cx="12" cy="12" r="5" fill={color} />}
        {diet === 'NON_VEG' && <path d="M12 6.5l6 10.5H6z" fill={color} />}
        {diet === 'EGG' && (
          <ellipse
            cx="12"
            cy="12.5"
            rx="4.2"
            ry="5.2"
            fill="none"
            stroke={color}
            strokeWidth="2.2"
          />
        )}
      </svg>
      {showLabel && <span className="text-[12.5px]">{DIET_TYPE_LABELS[diet]}</span>}
    </span>
  );
}

/** Healthy / Watch / Poor (design .band): icon + word. */
export function CostBandBadge({ band }: { band: CostBand }): ReactElement {
  const styles: Record<CostBand, string> = {
    healthy:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
    watch:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
    poor: 'border-red-700 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300',
  };
  const Icon = band === 'healthy' ? CircleCheck : band === 'watch' ? TriangleAlert : X;
  return (
    <span
      className={cn(
        'inline-flex h-[22px] flex-none items-center gap-[5px] rounded-md border px-2 text-xs font-bold [&_svg]:size-3',
        styles[band],
      )}
    >
      <Icon aria-hidden />
      {COST_BAND_LABELS[band]}
    </span>
  );
}

/** Food cost on a 0–60% scale with the target's healthy / watch / poor zones (design .meter). */
export function CostMeter({
  percent,
  targetMax,
}: {
  percent: number;
  targetMax: number;
}): ReactElement {
  const at = (value: number): number => Math.min(100, Math.max(0, (value / 60) * 100));
  return (
    <div
      className="relative h-2.5 rounded-full border border-zinc-300 dark:border-zinc-700"
      role="img"
      aria-label={`Food cost ${Math.round(percent)} percent; target up to ${targetMax} percent`}
      style={{
        background: `linear-gradient(90deg, #bbf7d0 0 ${at(targetMax)}%, #fde68a ${at(targetMax)}% ${at(targetMax + 7)}%, #fecaca ${at(targetMax + 7)}% 100%)`,
      }}
    >
      <b
        className="absolute -top-[5px] h-[18px] w-1 rounded-sm border border-background bg-foreground"
        style={{ left: `calc(${at(percent)}% - 2px)` }}
      />
    </div>
  );
}
