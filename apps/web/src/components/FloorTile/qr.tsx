'use client';

import { QrCode } from 'lucide-react';
import type { CSSProperties, ReactElement } from 'react';

import useNow from '@/hooks/useNow';
import { formatWaiting } from '@/lib/qr';

/** QR ordering state of one table on the floor board (C5a/C5b). */
export type QrTileMarker = {
  waitingSince: string | null;
  escalated: boolean;
  billRequested: boolean;
  noCaptain: boolean;
};

/** Tile overrides: amber pulse for a waiting QR order, dashed red when QR ordering is off. */
export function qrTileStyle(marker: QrTileMarker | undefined): CSSProperties | undefined {
  if (!marker) return undefined;
  if (marker.waitingSince) {
    return {
      border: '2px solid var(--qs-aw)',
      background: 'var(--qs-aw-b)',
      color: 'var(--qs-aw-f)',
    };
  }
  if (marker.noCaptain) return { border: '2px dashed var(--qs-es)' };
  return undefined;
}

export function qrAriaSuffix(marker: QrTileMarker | undefined): string {
  if (!marker) return '';
  if (marker.waitingSince) return ', QR order waiting';
  if (marker.noCaptain) return ', QR ordering off, no captain';
  if (marker.billRequested) return ', bill requested';
  return '';
}

/** "QR order · 2:14" (live), "QR ordering off" or "Bill requested", or null. */
export function QrTileLine({ marker }: { marker: QrTileMarker | undefined }): ReactElement | null {
  const now = useNow(1000);
  if (!marker) return null;
  if (marker.waitingSince) {
    return (
      <span className="flex items-center gap-1 truncate text-[11px] font-bold xl:text-xs">
        <QrCode className="size-3 shrink-0" aria-hidden /> QR order ·{' '}
        {formatWaiting(marker.waitingSince, now)}
      </span>
    );
  }
  if (marker.noCaptain) {
    return (
      <span
        className="flex items-center gap-1 truncate text-[11px] font-bold xl:text-xs"
        style={{ color: 'var(--qs-es)' }}
      >
        <QrCode className="size-3 shrink-0" aria-hidden /> QR off
      </span>
    );
  }
  if (marker.billRequested) {
    return (
      <span
        className="truncate text-[11px] font-bold xl:text-xs"
        style={{ color: 'var(--qs-ap-f)' }}
      >
        Bill requested
      </span>
    );
  }
  return null;
}
