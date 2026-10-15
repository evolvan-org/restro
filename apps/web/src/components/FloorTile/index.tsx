import type { RestaurantTable } from '@rms/api-contract';
import { cn } from 'cn';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export type StatusColorClasses = {
  border: string;
  dot: string;
  badge: string;
};

const STATUS_COLOR_PALETTE: readonly StatusColorClasses[] = [
  {
    border: 'border-l-green-500',
    dot: 'bg-green-500',
    badge: 'bg-green-100 text-green-800 dark:bg-green-400/20 dark:text-green-300',
  },
  {
    border: 'border-l-amber-500',
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-400/20 dark:text-amber-300',
  },
  {
    border: 'border-l-red-500',
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-800 dark:bg-red-400/20 dark:text-red-300',
  },
  {
    border: 'border-l-slate-400',
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-400/20 dark:text-slate-300',
  },
];

/** Used when a table's status has no entry in the map, e.g. a status added after this page loaded. */
export const DEFAULT_STATUS_COLOR: StatusColorClasses = {
  border: 'border-l-muted-foreground/30',
  dot: 'bg-muted-foreground/40',
  badge: 'bg-muted text-muted-foreground',
};

/**
 * Assigns a color to each status by its position in `statuses` (already sorted by `sortOrder`
 * from the API), rather than switching on status codes, so a newly added status still gets a
 * color instead of breaking the board.
 */
export function buildStatusColorMap(
  statuses: readonly { code: string }[],
): Record<string, StatusColorClasses> {
  return Object.fromEntries(
    statuses.map((status, index) => [
      status.code,
      STATUS_COLOR_PALETTE[index % STATUS_COLOR_PALETTE.length],
    ]),
  );
}

type FloorTileProps = {
  table: RestaurantTable;
  colorClasses: StatusColorClasses;
};

export default function FloorTile({ table, colorClasses }: FloorTileProps): ReactElement {
  return (
    <Card size="sm" className={cn('border-l-4', colorClasses.border)}>
      <CardContent>
        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-semibold">{table.tableNumber}</p>
          <Badge className={colorClasses.badge}>{table.currentStatus.name}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {table.capacity} {table.capacity === 1 ? 'seat' : 'seats'}
        </p>
      </CardContent>
    </Card>
  );
}
