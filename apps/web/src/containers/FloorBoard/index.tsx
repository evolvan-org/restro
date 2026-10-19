'use client';

import type { RestaurantTable } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { MAX_PAGE_SIZE } from '@rms/shared';
import { cn } from 'cn';
import { type ReactElement, useState } from 'react';

import FloorTile, { buildStatusColorMap, DEFAULT_STATUS_COLOR } from '@/components/FloorTile';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import { getApiErrorMessage } from '@/lib/api-error';
import { useTableList, useTableOptions } from '@/services/api/requests/tables';

const FLOOR_BOARD_REFRESH_MS = 12_000;

type SectionGroup = {
  id: string;
  name: string;
  tables: RestaurantTable[];
};

export default function FloorBoard(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.RESTAURANT_READ]);
  const { can } = usePermissions();
  const canRead = can(Permission.RESTAURANT_READ);

  const [sectionId, setSectionId] = useState('');
  const [statusId, setStatusId] = useState('');

  const options = useTableOptions(canRead);
  const tables = useTableList(
    {
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      isActive: true,
      sectionId: sectionId || undefined,
      statusId: statusId || undefined,
    },
    canRead,
    FLOOR_BOARD_REFRESH_MS,
  );

  if (!isAllowed) {
    return null;
  }

  const sections = options.data?.sections ?? [];
  const statuses = options.data?.statuses ?? [];
  const rows = tables.data?.data ?? [];
  const hasFilters = Boolean(sectionId || statusId);
  const colorMap = buildStatusColorMap(statuses);

  const groups: SectionGroup[] = sections
    .map((section) => ({
      id: section.id,
      name: section.name,
      tables: rows.filter((table) => table.section.id === section.id),
    }))
    .filter((group) => group.tables.length > 0);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">Restaurant setup</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Live floor board</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Real-time table availability across the floor.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <NativeSelect
          aria-label="Filter by section"
          value={sectionId}
          disabled={options.isPending}
          onChange={(event) => setSectionId(event.target.value)}
        >
          <NativeSelectOption value="">All sections</NativeSelectOption>
          {sections.map((section) => (
            <NativeSelectOption key={section.id} value={section.id}>
              {section.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <NativeSelect
          aria-label="Filter by status"
          value={statusId}
          disabled={options.isPending}
          onChange={(event) => setStatusId(event.target.value)}
        >
          <NativeSelectOption value="">All statuses</NativeSelectOption>
          {statuses.map((status) => (
            <NativeSelectOption key={status.id} value={status.id}>
              {status.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {statuses.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-md border px-4 py-3 text-sm">
          {statuses.map((status) => {
            const colors = colorMap[status.code] ?? DEFAULT_STATUS_COLOR;
            const count = rows.filter((table) => table.currentStatus.id === status.id).length;

            return (
              <div key={status.id} className="flex items-center gap-2">
                <span className={cn('size-2.5 rounded-full', colors.dot)} aria-hidden />
                <span>{status.name}</span>
                <span className="text-muted-foreground">({count})</span>
              </div>
            );
          })}
        </div>
      )}

      {tables.isError ? (
        <div className="space-y-3 rounded-md border px-4 py-6 text-center">
          <p role="alert" className="text-sm text-destructive">
            {getApiErrorMessage(tables.error, 'Unable to load the floor board.')}
          </p>
          <Button type="button" variant="outline" onClick={() => tables.refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border px-4 py-10 text-center text-muted-foreground">
          {tables.isPending
            ? 'Loading floor board...'
            : hasFilters
              ? 'No tables match your filters.'
              : 'No active tables yet.'}
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.id}>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">{group.name}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {group.tables.map((table) => (
                  <FloorTile
                    key={table.id}
                    table={table}
                    colorClasses={colorMap[table.currentStatus.code] ?? DEFAULT_STATUS_COLOR}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
