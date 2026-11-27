'use client';

import type { OperatingTask, OperatingTaskQuery } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { type ReactElement, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import useShowApiError from '@/hooks/api/useShowApiError';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import { useOperatingTasks } from '@/services/api/requests/operating-tasks';

import { TASK_KIND_LABELS, TASK_STATUS_LABELS } from './mappers';
import TaskDecisionDialog from './TaskDecisionDialog';
import TaskEditorDialog from './TaskEditorDialog';
import TaskHistoryDialog from './TaskHistoryDialog';
import TaskOutcomeDialog from './TaskOutcomeDialog';

type Filters = {
  status: OperatingTaskQuery['status'] | '';
  kind: OperatingTaskQuery['kind'] | '';
  page: number;
};
type Selected =
  | { mode: 'edit' | 'record' | 'cancel' | 'resolve' | 'history'; task: OperatingTask }
  | { mode: 'create' };
export default function OperatingTasks(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.TASK_READ]);
  const { can } = usePermissions();
  const canManage = can(Permission.TASK_MANAGE),
    canComplete = can(Permission.TASK_COMPLETE);
  // Tracks the check and action explicitly opened by the operator; API data stays in Query.
  const [selected, setSelected] = useState<Selected | null>(null);
  const filters = useForm<Filters>({ defaultValues: { status: 'PENDING', kind: '', page: 1 } });
  const status = useWatch({ control: filters.control, name: 'status' }),
    kind = useWatch({ control: filters.control, name: 'kind' }),
    page = useWatch({ control: filters.control, name: 'page' });
  const tasks = useOperatingTasks(
    { status: status || undefined, kind: kind || undefined, page, pageSize: 20 },
    allowed,
  );
  const showApiError = useShowApiError('Unable to load operating checks.');
  useEffect(() => {
    if (tasks.error) showApiError(tasks.error);
  }, [tasks.error, tasks.errorUpdatedAt, showApiError]);
  if (!allowed) return null;
  const meta = tasks.data?.meta;
  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Daily operating checks</h1>
          <p className="text-muted-foreground">
            {canManage
              ? 'Assign and review service and food-safety checks.'
              : 'Review and record your assigned checks.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={tasks.isFetching}
            onClick={() => void tasks.refetch()}
          >
            Refresh checks
          </Button>
          {canManage && (
            <Button type="button" onClick={() => setSelected({ mode: 'create' })}>
              Assign check
            </Button>
          )}
        </div>
      </div>
      <form
        className="flex flex-wrap gap-4"
        aria-label="Operating check filters"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="text-sm">
          Status
          <select
            className="ml-2 rounded border p-2"
            {...filters.register('status', { onChange: () => filters.setValue('page', 1) })}
          >
            <option value="">All statuses</option>
            {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Check type
          <select
            className="ml-2 rounded border p-2"
            {...filters.register('kind', { onChange: () => filters.setValue('page', 1) })}
          >
            <option value="">All types</option>
            {Object.entries(TASK_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </form>
      {tasks.data && (
        <p className="text-sm text-muted-foreground">
          Last updated {new Date(tasks.data.updatedAt).toLocaleString()}. Refresh to check overdue
          status.
        </p>
      )}
      {tasks.isPending && <p role="status">Loading checks…</p>}
      {tasks.isError && (
        <p role="alert">Unable to load operating checks. Use Refresh checks to retry.</p>
      )}
      {tasks.isSuccess && tasks.data.data.length === 0 && <p>No checks match these filters.</p>}
      <ul className="grid gap-4 lg:grid-cols-2">
        {tasks.data?.data.map((task) => (
          <li key={task.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex justify-between gap-3">
              <h2 className="font-semibold">{task.title}</h2>
              <span>{TASK_STATUS_LABELS[task.status]}</span>
            </div>
            <p>
              {TASK_KIND_LABELS[task.kind]} · {task.assignedTo.name}
            </p>
            <p>
              Due {new Date(task.dueAt).toLocaleString()}
              {task.isOverdue && <strong className="ml-2 text-destructive">Overdue</strong>}
            </p>
            {task.instructions && <p className="whitespace-pre-wrap">{task.instructions}</p>}
            {task.result && (
              <p>
                Observation: {task.result.notes}
                {task.result.temperatureCelsius !== null &&
                  ` · ${task.result.temperatureCelsius} °C`}
                {task.result.observedExpiryDate && ` · Expiry ${task.result.observedExpiryDate}`}
              </p>
            )}
            {task.resolution && <p>Decision: {task.resolution}</p>}
            <div className="flex flex-wrap gap-2">
              {task.status === 'PENDING' && canComplete && (
                <Button type="button" onClick={() => setSelected({ mode: 'record', task })}>
                  Record outcome
                </Button>
              )}
              {task.status === 'PENDING' && canManage && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelected({ mode: 'edit', task })}
                >
                  Edit check
                </Button>
              )}
              {task.status === 'EXCEPTION' && canManage && (
                <Button type="button" onClick={() => setSelected({ mode: 'resolve', task })}>
                  Resolve exception
                </Button>
              )}
              {['PENDING', 'EXCEPTION'].includes(task.status) && canManage && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelected({ mode: 'cancel', task })}
                >
                  Cancel check
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelected({ mode: 'history', task })}
              >
                History
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1 || tasks.isFetching}
            onClick={() => filters.setValue('page', page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {meta.totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page >= meta.totalPages || tasks.isFetching}
            onClick={() => filters.setValue('page', page + 1)}
          >
            Next
          </Button>
        </div>
      )}
      {selected?.mode === 'create' && <TaskEditorDialog onClose={() => setSelected(null)} />}
      {selected?.mode === 'edit' && (
        <TaskEditorDialog task={selected.task} onClose={() => setSelected(null)} />
      )}
      {selected?.mode === 'record' && (
        <TaskOutcomeDialog task={selected.task} onClose={() => setSelected(null)} />
      )}
      {selected?.mode === 'history' && (
        <TaskHistoryDialog task={selected.task} onClose={() => setSelected(null)} />
      )}
      {(selected?.mode === 'cancel' || selected?.mode === 'resolve') && (
        <TaskDecisionDialog
          task={selected.task}
          mode={selected.mode}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
