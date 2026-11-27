'use client';

import type { FoodIncidentQuery } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { type ReactElement, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import useShowApiError from '@/hooks/api/useShowApiError';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import { useFoodIncidents } from '@/services/api/requests/food-incidents';

import IncidentDetails from './Details';
import IncidentEditor from './Editor';

export default function FoodIncidents(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.FOOD_INCIDENT_READ]);
  const { can } = usePermissions();
  const manage = can(Permission.FOOD_INCIDENT_MANAGE);
  // The case/dialog explicitly opened by the operator; API results remain in TanStack Query.
  const [selected, setSelected] = useState<{ id: string } | { create: true } | null>(null);
  const filters = useForm<{ status: FoodIncidentQuery['status']; page: number }>({
    defaultValues: { status: 'OPEN', page: 1 },
  });
  const status = useWatch({ control: filters.control, name: 'status' });
  const page = useWatch({ control: filters.control, name: 'page' });
  const query = useFoodIncidents({ status, page, pageSize: 20 }, allowed);
  const showApiError = useShowApiError('Unable to load food incidents.');
  useEffect(() => {
    if (query.error) showApiError(query.error);
  }, [query.error, query.errorUpdatedAt, showApiError]);
  if (!allowed) return null;
  const meta = query.data?.meta;
  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Food incidents</h1>
          <p className="text-muted-foreground">
            Review affected batches and retain response decisions and corrective actions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh incidents
          </Button>
          {manage && (
            <Button type="button" onClick={() => setSelected({ create: true })}>
              Record incident
            </Button>
          )}
        </div>
      </div>
      <p className="rounded-md border p-3 text-sm">
        Case records do not automatically quarantine or dispose stock. Production, transfer and
        affected-order tracing are not available yet.
      </p>
      <div className="flex gap-2" role="group" aria-label="Incident status filter">
        {(['OPEN', 'RESOLVED', undefined] as const).map((value) => (
          <Button
            key={value ?? 'ALL'}
            type="button"
            variant="outline"
            aria-pressed={status === value}
            onClick={() => filters.reset({ status: value, page: 1 })}
          >
            {value === 'OPEN' ? 'Open' : value === 'RESOLVED' ? 'Resolved' : 'All incidents'}
          </Button>
        ))}
      </div>
      {query.isPending && <p role="status">Loading incidents…</p>}
      {query.isError && (
        <p role="alert">Unable to load incidents. Use Refresh incidents to retry.</p>
      )}
      {query.data?.data.length === 0 && <p>No incidents on this page.</p>}
      <ul className="space-y-3">
        {query.data?.data.map((incident) => (
          <li
            key={incident.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
          >
            <div>
              <h2 className="font-semibold">{incident.title}</h2>
              <p className="text-sm text-muted-foreground">
                {incident.status} · {incident.batches.length} linked batches ·{' '}
                {new Date(incident.createdAt).toLocaleString()} · {incident.createdBy.name}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelected({ id: incident.id })}
            >
              View incident
            </Button>
          </li>
        ))}
      </ul>
      {meta && (
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1 || query.isFetching}
            onClick={() => filters.setValue('page', page - 1)}
          >
            Previous incidents
          </Button>
          <span>
            Page {page} of {meta.totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page >= meta.totalPages || query.isFetching}
            onClick={() => filters.setValue('page', page + 1)}
          >
            Next incidents
          </Button>
        </div>
      )}
      {selected !== null &&
        ('create' in selected ? (
          <IncidentEditor onClose={() => setSelected(null)} />
        ) : (
          <IncidentDetails id={selected.id} canManage={manage} onClose={() => setSelected(null)} />
        ))}
    </main>
  );
}
