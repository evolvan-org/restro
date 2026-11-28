'use client';

import type { OperatingTask } from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import useShowApiError from '@/hooks/api/useShowApiError';
import { useOperatingTaskHistory } from '@/services/api/requests/operating-tasks';

import { TASK_STATUS_LABELS } from './mappers';

const ACTION_LABELS = {
  CREATED: 'Assigned',
  UPDATED: 'Changed',
  COMPLETED: 'Completed',
  EXCEPTION: 'Exception recorded',
  RESOLVED: 'Exception resolved',
  CANCELLED: 'Cancelled',
};
export default function TaskHistoryDialog({
  task,
  onClose,
}: {
  task: OperatingTask;
  onClose: () => void;
}): ReactElement {
  const form = useForm({ defaultValues: { page: 1 } });
  const page = useWatch({ control: form.control, name: 'page' });
  const history = useOperatingTaskHistory(task.id, page);
  const showApiError = useShowApiError('Unable to load check history.');
  useEffect(() => {
    if (history.error) showApiError(history.error);
  }, [history.error, history.errorUpdatedAt, showApiError]);
  const meta = history.data?.meta;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Check history · {task.title}</DialogTitle>
          <DialogDescription>
            Each record keeps the assignment, due time and observations saved at that moment.
            Overdue means the deadline had passed when the action was recorded.
          </DialogDescription>
        </DialogHeader>
        {history.isPending && <p role="status">Loading history…</p>}
        {history.isError && <p role="alert">Unable to load check history.</p>}
        <ol className="space-y-3">
          {history.data?.data.map((event) => (
            <li key={event.id} className="rounded border p-3">
              <h3 className="font-medium">
                {ACTION_LABELS[event.action]} · {TASK_STATUS_LABELS[event.snapshot.status]}
              </h3>
              <p>
                {new Date(event.createdAt).toLocaleString()} · {event.recordedBy.name}
              </p>
              <p>
                Assigned to {event.snapshot.assignedTo.name} · Due{' '}
                {new Date(event.snapshot.dueAt).toLocaleString()}
              </p>
              {event.wasOverdue && (
                <p className="font-medium text-destructive">
                  {event.action === 'UPDATED'
                    ? 'Previous deadline had passed'
                    : 'Deadline had passed'}
                </p>
              )}
              {event.reason && <p>{event.reason}</p>}
              {event.snapshot.result?.temperatureCelsius != null && (
                <p>Measured {event.snapshot.result.temperatureCelsius} °C</p>
              )}
              {event.snapshot.result?.observedExpiryDate && (
                <p>Observed expiry: {event.snapshot.result.observedExpiryDate}</p>
              )}
              <details className="mt-2">
                <summary>Saved check details</summary>
                <p>{event.snapshot.title}</p>
                <p>{event.snapshot.instructions}</p>
              </details>
            </li>
          ))}
        </ol>
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1 || history.isFetching}
              onClick={() => form.setValue('page', page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} of {meta.totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={page >= meta.totalPages || history.isFetching}
              onClick={() => form.setValue('page', page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
