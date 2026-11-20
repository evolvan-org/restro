'use client';

import { Clock, Maximize, Minimize, Moon, Sun } from 'lucide-react';
import type { ReactElement } from 'react';

import { type ActiveKotStatus, FILTERS, type StationConfig } from './config';
import { useNow } from './hooks';
import { formatClock } from './mapper';

export type StatusFilter = 'ALL' | ActiveKotStatus;

function WallClock(): ReactElement {
  const now = useNow();
  return (
    <time className="px-2 text-[26px] font-bold tracking-[-0.02em]" suppressHydrationWarning>
      {formatClock(now)}
    </time>
  );
}

const ICON_BUTTON =
  'grid size-12 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)]';

export default function TopBar({
  station,
  offline,
  lastSync,
  counts,
  filter,
  onFilterChange,
  lateCount,
  dark,
  onToggleTheme,
  fullscreen,
  onToggleFullscreen,
}: {
  station: StationConfig;
  offline: boolean;
  lastSync: number;
  counts: Record<StatusFilter, number>;
  filter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  lateCount: number;
  dark: boolean;
  onToggleTheme: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}): ReactElement {
  const StationIcon = station.icon;
  const themeLabel = dark ? 'Switch to light theme' : 'Switch to dark theme';
  const fullscreenLabel = fullscreen ? 'Exit full screen' : 'Enter full screen';
  const ThemeIcon = dark ? Sun : Moon;
  const FullscreenIcon = fullscreen ? Minimize : Maximize;

  return (
    <header className="sticky top-0 z-[2] flex flex-wrap items-center gap-x-7 gap-y-4 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3.5">
      <div className="flex min-w-0 flex-[1_1_260px] items-center gap-3.5">
        <div
          className="grid size-12 shrink-0 place-items-center rounded-xl"
          style={{ background: station.accent, color: station.accentFg }}
        >
          <StationIcon className="size-[26px]" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="m-0 text-[26px] leading-[30px] font-extrabold tracking-[-0.02em]">
            {station.name}
          </h1>
          {lastSync > 0 && (
            <div role="status" className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
              <span
                className={`size-2 rounded-full ${offline ? 'bg-[var(--amber)]' : 'bg-[var(--live)]'}`}
                aria-hidden
              />
              <strong className="font-semibold text-[var(--text)]">
                {offline ? 'Reconnecting…' : 'Live'}
              </strong>
              <span>
                {offline ? 'Last update' : 'Updated'} {formatClock(lastSync, true)}
              </span>
            </div>
          )}
        </div>
      </div>
      <nav
        aria-label="Filter tickets by status"
        className="flex flex-wrap gap-1.5 rounded-[14px] bg-[var(--surface2)] p-1"
      >
        {FILTERS.map(({ key, label, swatch }) => {
          const pressed = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={pressed}
              onClick={() => onFilterChange(key)}
              className={`flex min-h-11 items-center gap-2.5 rounded-[10px] px-4 text-[15px] font-semibold ${pressed ? 'bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_2px_rgba(0,0,0,0.25)]' : 'bg-transparent text-[var(--muted)]'}`}
            >
              <span className="size-2.5 rounded-[3px]" style={{ background: swatch }} aria-hidden />
              <span>{label}</span>
              <span
                className={`min-w-[26px] rounded-full px-2 py-0.5 text-sm font-bold ${pressed ? 'bg-[var(--surface2)]' : ''}`}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-2.5">
        {lateCount > 0 && (
          <span className="flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--red)] px-3 text-sm font-bold text-[var(--red-fg)]">
            <Clock className="size-4" strokeWidth={2.4} aria-hidden />
            {lateCount} late
          </span>
        )}
        <WallClock />
        <button
          type="button"
          className={ICON_BUTTON}
          onClick={onToggleTheme}
          aria-label={themeLabel}
          title={themeLabel}
        >
          <ThemeIcon className="size-[22px]" aria-hidden />
        </button>
        <button
          type="button"
          className={ICON_BUTTON}
          onClick={onToggleFullscreen}
          aria-label={fullscreenLabel}
          title={fullscreenLabel}
        >
          <FullscreenIcon className="size-[22px]" aria-hidden />
        </button>
      </div>
    </header>
  );
}
