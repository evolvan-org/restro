import type { RealtimeResource } from '@rms/api-contract';
import type { QueryClient } from '@tanstack/react-query';

import { DiningSectionQueryKey } from './types/DiningSectionQueryKey';
import { MenuCategoryQueryKey } from './types/MenuCategoryQueryKey';
import { MenuItemQueryKey } from './types/MenuItemQueryKey';
import { TableQueryKey } from './types/TableQueryKey';
import { TableStatusQueryKey } from './types/TableStatusQueryKey';

const RESOURCE_QUERY_PREFIXES: Record<RealtimeResource, readonly string[]> = {
  'menu-items': [MenuItemQueryKey.Items],
  'menu-categories': [MenuCategoryQueryKey.Categories, MenuItemQueryKey.Items],
  tables: [TableQueryKey.Tables],
  'table-statuses': [
    TableStatusQueryKey.TableStatuses,
    TableQueryKey.Options,
    TableQueryKey.Tables,
  ],
  'dining-sections': [DiningSectionQueryKey.Sections, TableQueryKey.Options, TableQueryKey.Tables],
};

/** Only mounted affected queries refetch. Inactive queries become stale for their next visit. */
export async function invalidateRealtimeResource(
  queryClient: QueryClient,
  resource: RealtimeResource,
): Promise<void> {
  await Promise.all(
    RESOURCE_QUERY_PREFIXES[resource].map((prefix) =>
      queryClient.invalidateQueries({ queryKey: [prefix] }),
    ),
  );
}
