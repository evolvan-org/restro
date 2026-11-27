'use client';

import type { WorkforceSnapshot } from '@rms/api-contract';
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
import { useWorkforceHistory } from '@/services/api/requests/workforce';

import { AVAILABILITY_LABELS, LEAVE_KIND_LABELS, WORKFORCE_ACTION_LABELS } from './mappers';

export default function HistoryDialog({
  entity,
  id,
  name,
  onClose,
}: {
  entity: WorkforceSnapshot['entity'];
  id: string;
  name: string;
  onClose: () => void;
}): ReactElement {
  const form = useForm({ defaultValues: { page: 1 } });
  const page = useWatch({ control: form.control, name: 'page' });
  const history = useWorkforceHistory(entity, id, page);
  const showApiError = useShowApiError('Unable to load schedule history.');
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
          <DialogTitle>Schedule history · {name}</DialogTitle>
          <DialogDescription>
            Saved assignments, absence records, decisions and reasons at each change. Later edits do
            not replace these records.
          </DialogDescription>
        </DialogHeader>
        {history.isPending && <p role="status">Loading history…</p>}
        {history.isError && <p role="alert">Unable to load schedule history.</p>}
        <ol className="space-y-3">
          {history.data?.data.map((event) => (
            <li key={event.id} className="space-y-1 rounded border p-3">
              <h3 className="font-semibold">{WORKFORCE_ACTION_LABELS[event.action]}</h3>
              <p>
                {new Date(event.createdAt).toLocaleString()} · {event.recordedBy.name}
              </p>
              <p>Staff: {event.snapshot.data.user.name}</p>
              <p>
                {new Date(event.snapshot.data.startsAt).toLocaleString()} –{' '}
                {new Date(event.snapshot.data.endsAt).toLocaleString()}
              </p>
              {event.reason && <p>{event.reason}</p>}
              {event.snapshot.entity === 'SHIFT' && (
                <p>
                  {event.snapshot.data.status} · {event.snapshot.data.note}
                </p>
              )}
              {event.snapshot.entity === 'AVAILABILITY' && (
                <p>
                  {AVAILABILITY_LABELS[event.snapshot.data.kind]} ·{' '}
                  {event.snapshot.data.isActive ? 'Active' : 'Archived'} ·{' '}
                  {event.snapshot.data.note}
                </p>
              )}
              {event.snapshot.entity === 'LEAVE' && (
                <>
                  <p>
                    {LEAVE_KIND_LABELS[event.snapshot.data.kind]} · {event.snapshot.data.status}
                  </p>
                  <p>{event.snapshot.data.reason}</p>
                  {event.snapshot.data.reviewedBy && (
                    <p>
                      Reviewer: {event.snapshot.data.reviewedBy.name} ·{' '}
                      {event.snapshot.data.reviewNote}
                    </p>
                  )}
                </>
              )}
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
