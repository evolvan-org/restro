import { zodResolver } from '@hookform/resolvers/zod';
import { Permission } from '@rms/permissions';
import { type ReactElement, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import useShowApiError from '@/hooks/api/useShowApiError';
import usePermissions from '@/hooks/auth/usePermissions';
import {
  useFoodIncident,
  useFoodIncidentHistory,
  useSaveFoodIncident,
} from '@/services/api/requests/food-incidents';

import { responseCommand, responseDefaults, type ResponseForm, responseSchema } from './mappers';
import IncidentReceipt from './Receipt';
const labels = {
  CREATED: 'Incident recorded',
  NOTE: 'Note',
  DECISION: 'Decision',
  CORRECTIVE_ACTION: 'Corrective action',
  RESOLVED: 'Resolved',
};
export default function IncidentDetails({
  id,
  canManage,
  onClose,
}: {
  id: string;
  canManage: boolean;
  onClose: () => void;
}): ReactElement {
  const { can } = usePermissions();
  const canReadReceipt = can(Permission.INVENTORY_MANAGE);
  // Only the receipt explicitly opened by the operator; fetched data stays in TanStack Query.
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const query = useFoodIncident(id);
  const pages = useForm({ defaultValues: { page: 1 } });
  const page = useWatch({ control: pages.control, name: 'page' });
  const history = useFoodIncidentHistory(id, page);
  const form = useForm<ResponseForm>({
    resolver: zodResolver(responseSchema),
    defaultValues: responseDefaults(),
  });
  const { reset } = form;
  const { mutateAsync: saveResponse, isPending, isSuccess } = useSaveFoodIncident();
  const showApiError = useShowApiError('Unable to load the incident.');
  useEffect(() => {
    if (query.error) showApiError(query.error);
  }, [query.error, query.errorUpdatedAt, showApiError]);
  useEffect(() => {
    if (history.error) showApiError(history.error);
  }, [history.error, history.errorUpdatedAt, showApiError]);
  useEffect(() => {
    if (isSuccess) reset(responseDefaults());
  }, [isSuccess, reset]);
  const incident = query.data;
  const submit = form.handleSubmit(async (values) => {
    if (!incident) return;
    try {
      await saveResponse(responseCommand(id, incident.version, values));
    } catch {
      /* Shared mutation handling reports the error and retains the response draft. */
    }
  });
  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{incident?.title ?? 'Food incident'}</DialogTitle>
          <DialogDescription>
            Recorded batch links and response history. Production, transfer and affected-order links
            are not tracked yet; stock changes must be recorded separately through authorised
            inventory actions.
          </DialogDescription>
        </DialogHeader>
        <Button
          type="button"
          variant="outline"
          disabled={query.isFetching || history.isFetching || isPending}
          onClick={() => {
            void query.refetch();
            void history.refetch();
          }}
        >
          Refresh incident
        </Button>
        {query.isPending && <p role="status">Loading incident…</p>}
        {query.isError && <p role="alert">Unable to load incident details.</p>}
        {incident && !query.isError && (
          <>
            <p>
              {incident.status} · Recorded by {incident.createdBy.name} ·{' '}
              {new Date(incident.createdAt).toLocaleString()}
            </p>
            <p className="whitespace-pre-wrap">{incident.description}</p>
            <h3 className="font-semibold">Saved batch records</h3>
            <ul className="space-y-2">
              {incident.batches.map((batch) => (
                <li key={batch.id} className="rounded-md border p-3">
                  <p>
                    {batch.stockItemName} · {batch.batchNumber}
                  </p>
                  <p className="text-sm">
                    Received {new Date(batch.receivedAt).toLocaleString()} · Expiry{' '}
                    {batch.expiryDate ?? 'not recorded'}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    Batch reference: {batch.id}
                    {batch.receiptId && ` · Goods receipt reference: ${batch.receiptId}`}
                  </p>
                  {batch.receiptId && canReadReceipt && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-2"
                      onClick={() => setReceiptId(batch.receiptId)}
                    >
                      Open goods receipt
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {incident.status === 'RESOLVED' && (
              <p className="rounded-md border p-3 whitespace-pre-wrap">
                Resolved by {incident.resolvedBy?.name} ·{' '}
                {incident.resolvedAt && new Date(incident.resolvedAt).toLocaleString()}
                <br />
                {incident.resolution}
              </p>
            )}
            {canManage && incident.status === 'OPEN' && (
              <form onSubmit={submit} className="space-y-3 rounded-md border p-3">
                <h3 className="font-semibold">Record response</h3>
                <label htmlFor="incident-response-kind">Response type</label>
                <select
                  id="incident-response-kind"
                  {...form.register('kind')}
                  className="block rounded-md border p-2"
                >
                  <option value="NOTE">Note</option>
                  <option value="DECISION">Recall or response decision</option>
                  <option value="CORRECTIVE_ACTION">Corrective action</option>
                  <option value="RESOLVE">Resolve incident</option>
                </select>
                <label htmlFor="incident-response-note">Response details</label>
                <Textarea
                  id="incident-response-note"
                  {...form.register('note')}
                  aria-invalid={Boolean(form.formState.errors.note)}
                />
                <p className="text-sm text-destructive">{form.formState.errors.note?.message}</p>
                <Button type="submit" disabled={isPending || query.isFetching}>
                  Save response
                </Button>
              </form>
            )}
          </>
        )}
        <h3 className="font-semibold">Response history</h3>
        {history.isPending && <p role="status">Loading history…</p>}
        {history.isError && <p role="alert">Unable to load response history.</p>}
        <ol className="space-y-2">
          {history.data?.data.map((entry) => (
            <li key={entry.id} className="rounded-md border p-3">
              <p className="font-medium">{labels[entry.kind]}</p>
              <p className="text-sm text-muted-foreground">
                {entry.actor.name} · {new Date(entry.createdAt).toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap">{entry.note}</p>
            </li>
          ))}
        </ol>
        {history.data && (
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1 || history.isFetching}
              onClick={() => pages.setValue('page', page - 1)}
            >
              Previous history
            </Button>
            <span>
              Page {page} of {history.data.meta.totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={page >= history.data.meta.totalPages || history.isFetching}
              onClick={() => pages.setValue('page', page + 1)}
            >
              Next history
            </Button>
          </div>
        )}
        {receiptId !== null && canReadReceipt && (
          <IncidentReceipt id={receiptId} onClose={() => setReceiptId(null)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
