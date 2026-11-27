'use client';

import type { KotQueueItem, PreparationControlRequest } from '@rms/api-contract';
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
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import useShowApiError from '@/hooks/api/useShowApiError';
import { useControlPreparation, usePreparationHistory } from '@/services/api/requests/kots';

const actionLabels = {
  SENT: 'Sent for preparation',
  BASELINE: 'First observed state; earlier stage times are unknown',
  ACCEPT: 'Accepted',
  HOLD: 'Placed on hold',
  RELEASE: 'Released from hold',
  PRIORITY: 'Priority changed',
  TARGET: 'Target changed',
  STATUS: 'Stage changed',
};

export default function PreparationDialog({
  ticket,
  canControl,
  onClose,
}: {
  ticket: KotQueueItem;
  canControl: boolean;
  onClose: () => void;
}): ReactElement {
  const form = useForm({
    defaultValues: {
      reason: '',
      targetMinutes:
        ticket.preparation?.targetSeconds == null
          ? ''
          : String(ticket.preparation.targetSeconds / 60),
      page: 1,
    },
  });
  const page = useWatch({ control: form.control, name: 'page' });
  const history = usePreparationHistory(ticket.id, { page, pageSize: 10 });
  const { mutateAsync: controlPreparation, isPending } = useControlPreparation(
    ticket.destination,
    ticket.id,
  );
  const showApiError = useShowApiError('Unable to load preparation history.');
  useEffect(() => {
    if (history.error) showApiError(history.error);
  }, [history.error, history.errorUpdatedAt, showApiError]);
  const state = ticket.preparation;
  const version = state?.version ?? 0;
  const readOnly = !canControl || isPending || ticket.status === 'COMPLETED';
  async function control(input: PreparationControlRequest): Promise<void> {
    try {
      await controlPreparation(input);
    } catch {
      // The mutation hook owns errors; keep all fields available for correction or retry.
    }
  }
  const hold = form.handleSubmit(async ({ reason }) => {
    if (!reason.trim() || reason.trim().length > 255) {
      form.setError('reason', { message: 'Enter a hold reason, up to 255 characters.' });
      return;
    }
    await control({ action: 'HOLD', expectedVersion: version, reason });
  });
  const setTarget = form.handleSubmit(async ({ targetMinutes }) => {
    const minutes = Number(targetMinutes);
    if (targetMinutes.trim() && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) {
      form.setError('targetMinutes', {
        message: 'Enter whole minutes from 1 to 1440, or leave blank to clear.',
      });
      return;
    }
    await control({
      action: 'TARGET',
      expectedVersion: version,
      targetSeconds: targetMinutes.trim() ? minutes * 60 : null,
    });
  });
  const meta = history.data?.meta;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preparation · {ticket.kotNumber}</DialogTitle>
          <DialogDescription>
            Targets count from the time the ticket was sent, including time on hold. Starting
            preparation also records acceptance if needed.
          </DialogDescription>
        </DialogHeader>
        <p>
          {ticket.status} · {state?.acceptedAt ? 'Accepted' : 'Not yet accepted'} ·{' '}
          {state?.isPriority ? 'Priority' : 'Normal priority'}
        </p>
        {state?.heldAt && <p role="status">On hold: {state.holdReason}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={
              readOnly ||
              ticket.status !== 'PENDING' ||
              Boolean(state?.acceptedAt) ||
              Boolean(state?.heldAt)
            }
            onClick={() => void control({ action: 'ACCEPT', expectedVersion: version })}
          >
            Accept ticket
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={readOnly}
            onClick={() =>
              void control({
                action: 'PRIORITY',
                expectedVersion: version,
                isPriority: !state?.isPriority,
              })
            }
          >
            {state?.isPriority ? 'Clear priority' : 'Mark priority'}
          </Button>
          {state?.heldAt && (
            <Button
              type="button"
              disabled={readOnly}
              onClick={() => void control({ action: 'RELEASE', expectedVersion: version })}
            >
              Release hold
            </Button>
          )}
        </div>
        <form onSubmit={hold} className="space-y-2" noValidate>
          <label className="block text-sm">
            Hold reason
            <Input maxLength={255} disabled={readOnly} {...form.register('reason')} />
          </label>
          <FieldError>{form.formState.errors.reason?.message}</FieldError>
          <Button
            type="submit"
            variant="outline"
            disabled={readOnly || Boolean(state?.heldAt) || ticket.status === 'READY'}
          >
            Hold ticket
          </Button>
        </form>
        <form onSubmit={setTarget} className="space-y-2" noValidate>
          <label className="block text-sm">
            Preparation target in minutes
            <Input
              type="number"
              min={1}
              max={1440}
              step={1}
              disabled={readOnly}
              {...form.register('targetMinutes')}
            />
          </label>
          <FieldError>{form.formState.errors.targetMinutes?.message}</FieldError>
          <Button type="submit" variant="outline" disabled={readOnly}>
            Save target
          </Button>
        </form>
        <h3 className="font-semibold">Preparation history</h3>
        {history.isPending && <p role="status">Loading preparation history…</p>}
        {history.isError && <p role="alert">Unable to load history. Close and try again.</p>}
        {history.isSuccess && history.data.data.length === 0 && (
          <p>No recorded stages yet. Earlier stage times are unknown.</p>
        )}
        <ol className="space-y-3">
          {history.data?.data.map((event) => (
            <li key={event.id} className="rounded border p-3">
              <p className="font-medium">
                {actionLabels[event.action]} · {event.status}
              </p>
              <p>
                {new Date(event.createdAt).toLocaleString()} · {event.recordedBy.name}
              </p>
              {event.reason && <p>{event.reason}</p>}
              {event.action === 'PRIORITY' && (
                <p>{event.state.isPriority ? 'Priority enabled' : 'Priority cleared'}</p>
              )}
              {event.action === 'TARGET' && (
                <p>
                  {event.state.targetSeconds === null
                    ? 'Target cleared'
                    : `Target: ${event.state.targetSeconds / 60} minutes`}
                </p>
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
