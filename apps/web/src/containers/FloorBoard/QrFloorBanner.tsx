'use client';

import type { QrFloorResponse } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { UserX } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';

import type { QrTileMarker } from '@/components/FloorTile/qr';
import { AssignCaptainSheet } from '@/containers/QrOrders/AssignCaptainSheet';
import usePermissions from '@/hooks/auth/usePermissions';
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

/**
 * Floor board banner (C5a): tables with no captain can't take QR orders. Managers can assign one in
 * one tap; the legend explains the tile markers.
 */
export default function QrFloorBanner({
  data,
  tableNumbers,
}: {
  data: QrFloorResponse | undefined;
  tableNumbers: ReadonlyMap<string, string>;
}): ReactElement | null {
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  if (!data?.enabled) return null;
  const missing = data.tables.filter((table) => table.noCaptain && tableNumbers.has(table.tableId));
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
          <span>
            {missing.length === 1
              ? `Table ${tableNumbers.get(first.tableId)} has no captain, so guests who scan it can’t order.`
              : `${missing.length} tables have no captain, so guests who scan them can’t order.`}
          </span>
          {can(Permission.QR_ORDER_MANAGE) && (
            <button
              type="button"
              className="ml-auto min-h-11 underline underline-offset-2"
              onClick={() => setOpen(true)}
            >
              Assign captain
            </button>
          )}
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
      {first && (
        <AssignCaptainSheet
          open={open}
          onOpenChange={setOpen}
          table={{ id: first.tableId, number: tableNumbers.get(first.tableId) ?? '' }}
          currentCaptain={null}
          waitingText={null}
        />
      )}
    </div>
  );
}
