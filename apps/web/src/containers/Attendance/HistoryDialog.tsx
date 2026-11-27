'use client';

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
import { useAttendanceHistory } from '@/services/api/requests/attendance';

import { ATTENDANCE_ACTION_LABELS } from './mappers';

export default function HistoryDialog({
  id,
  name,
  onClose,
}: {
  id: string;
  name: string;
  onClose: () => void;
}): ReactElement {
  const form = useForm({ defaultValues: { page: 1 } });
  const page = useWatch({ control: form.control, name: 'page' });
  const history = useAttendanceHistory(id, page);
  const showApiError = useShowApiError('Unable to load attendance history.');
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
          <DialogTitle>Attendance history · {name}</DialogTitle>
          <DialogDescription>
            Clock and break times use the server clock. Device and location labels are
            self-reported; browser details are supplied by the browser and are not proof of physical
            presence.
          </DialogDescription>
        </DialogHeader>
        {history.isPending && <p role="status">Loading attendance history…</p>}
        {history.isError && <p role="alert">Unable to load attendance history.</p>}
        <ol className="space-y-3">
          {history.data?.data.map((event) => (
            <li key={event.id} className="space-y-1 rounded border p-3">
              <h3 className="font-semibold">{ATTENDANCE_ACTION_LABELS[event.action]}</h3>
              <p>
                {new Date(event.createdAt).toLocaleString()} · {event.recordedBy.name}
              </p>
              {event.deviceLabel && <p>Reported device: {event.deviceLabel}</p>}
              {event.locationLabel && <p>Reported work location: {event.locationLabel}</p>}
              {event.note && <p>{event.note}</p>}
              {event.userAgent && (
                <details>
                  <summary>Browser details</summary>
                  <p className="break-words">{event.userAgent}</p>
                </details>
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
