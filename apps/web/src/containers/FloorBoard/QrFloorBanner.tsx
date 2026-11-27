'use client';

import type { QrFloorResponse } from '@rms/api-contract';
import { UserX } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';

import type { QrTileMarker } from '@/components/FloorTile/qr';
import { useQrFloor } from '@/services/api/requests/qr-orders';

/** QR markers for the floor tiles, keyed by table id; empty while QR ordering is off. */
export function useQrTileMarkers(enabled: boolean): {
  markers: ReadonlyMap<string, QrTileMarker>;
  data: QrFloorResponse | undefined;
} {
  const floor = useQrFloor(enabled);
  const markers = useMemo(() => {
    const map = new Map<string, QrTileMarker>();
    if (!floor.data?.enabled) return map;
    for (const table of floor.data.tables) map.set(table.tableId, table);
    return map;
  }, [floor.data]);
  return { markers, data: floor.data };
}

/** Id of the banner message, so the header's Assign button can reference it. */
export const QR_NO_CAPTAIN_MESSAGE_ID = 'qr-no-captain-message';

/** QR tables on the board that have no captain (empty while QR ordering is off). */
export function getQrTablesWithoutCaptain(
  data: QrFloorResponse | undefined,
  tableNumbers: ReadonlyMap<string, string>,
): QrFloorResponse['tables'] {
  if (!data?.enabled) return [];
  return data.tables.filter((table) => table.noCaptain && tableNumbers.has(table.tableId));
}

/**
 * Floor board banner (C5a): tables with no captain can't take QR orders. Message only; managers
 * assign captains from the highlighted "Assign captains" header button. The legend explains the
 * tile markers.
 */
export default function QrFloorBanner({
  data,
  tableNumbers,
}: {
  data: QrFloorResponse | undefined;
  tableNumbers: ReadonlyMap<string, string>;
}): ReactElement | null {
  if (!data?.enabled) return null;
  const missing = getQrTablesWithoutCaptain(data, tableNumbers);
  const first = missing[0];
  return (
    <div className="mb-4 flex flex-col gap-3">
      {first && (
        <div
          className="flex flex-wrap items-center gap-2.5 rounded-[9px] px-3.5 py-3 font-semibold"
          style={{
            background: 'var(--qs-rj-b)',
            color: 'var(--qs-rj-f)',
            boxShadow: 'inset 0 0 0 1px var(--qs-rj)',
          }}
          role="status"
        >
          <UserX className="size-4 shrink-0" aria-hidden />
          <span id={QR_NO_CAPTAIN_MESSAGE_ID}>
            {missing.length === 1
              ? `Table ${tableNumbers.get(first.tableId)} has no captain, so guests who scan it can’t order.`
              : `${missing.length} tables have no captain, so guests who scan them can’t order.`}
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-4 text-[13px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="size-3.5 rounded-[4px]"
            style={{ border: '2px solid var(--qs-aw)', background: 'var(--qs-aw-b)' }}
            aria-hidden
          />
          QR order waiting
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-3.5 rounded-[4px]"
            style={{ border: '2px dashed var(--qs-es)' }}
            aria-hidden
          />
          No captain · QR ordering off
        </span>
      </div>
    </div>
  );
}
