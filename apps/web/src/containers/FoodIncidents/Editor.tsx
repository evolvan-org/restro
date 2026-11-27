import { zodResolver } from '@hookform/resolvers/zod';
import { type CreateFoodIncident, createFoodIncidentSchema } from '@rms/api-contract';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import useShowApiError from '@/hooks/api/useShowApiError';
import {
  useFoodIncidentBatchOptions,
  useSaveFoodIncident,
} from '@/services/api/requests/food-incidents';

import { incidentDefaults } from './mappers';

export default function IncidentEditor({ onClose }: { onClose: () => void }): ReactElement {
  const form = useForm<CreateFoodIncident>({
    resolver: zodResolver(createFoodIncidentSchema),
    defaultValues: incidentDefaults(),
  });
  const pages = useForm({ defaultValues: { page: 1 } });
  const page = useWatch({ control: pages.control, name: 'page' });
  const selected = useWatch({ control: form.control, name: 'batchIds' });
  const batches = useFoodIncidentBatchOptions(page);
  const { mutateAsync: saveIncident, isPending, isSuccess } = useSaveFoodIncident();
  const showApiError = useShowApiError('Unable to load ingredient batches.');
  useEffect(() => {
    if (batches.error) showApiError(batches.error);
  }, [batches.error, batches.errorUpdatedAt, showApiError]);
  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);
  const submit = form.handleSubmit(async (input) => {
    try {
      await saveIncident({ action: 'create', input });
    } catch {
      /* Shared mutation handling retains the draft. */
    }
  });
  const meta = batches.data?.meta;
  return (
    <Dialog open onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Record food incident</DialogTitle>
          <DialogDescription>
            Select known batches, including depleted batches when relevant. Recording an incident
            does not quarantine or dispose stock.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="incident-title">Incident title</label>
            <Input
              id="incident-title"
              {...form.register('title')}
              aria-invalid={Boolean(form.formState.errors.title)}
            />
            <p className="text-sm text-destructive">{form.formState.errors.title?.message}</p>
          </div>
          <div>
            <label htmlFor="incident-description">What was observed?</label>
            <Textarea
              id="incident-description"
              {...form.register('description')}
              aria-invalid={Boolean(form.formState.errors.description)}
            />
            <p className="text-sm text-destructive">{form.formState.errors.description?.message}</p>
          </div>
          <fieldset className="space-y-2">
            <legend>Related batches · {selected.length} selected</legend>
            {batches.isPending && <p role="status">Loading batches…</p>}
            {batches.isError && (
              <Button type="button" variant="outline" onClick={() => void batches.refetch()}>
                Retry batches
              </Button>
            )}
            {batches.data?.data.length === 0 && <p>No recorded batches on this page.</p>}
            {batches.data?.data.map((batch) => (
              <label key={batch.id} className="flex items-start gap-3 rounded-md border p-3">
                <input type="checkbox" value={batch.id} {...form.register('batchIds')} />
                <span>
                  {batch.stockItemName} · {batch.batchNumber}
                  <span className="block text-sm text-muted-foreground">
                    Received {new Date(batch.receivedAt).toLocaleString()} · Expiry{' '}
                    {batch.expiryDate ?? 'not recorded'}
                  </span>
                </span>
              </label>
            ))}
            <p className="text-sm text-destructive">{form.formState.errors.batchIds?.message}</p>
          </fieldset>
          {meta && (
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1 || batches.isFetching}
                onClick={() => pages.setValue('page', page - 1)}
              >
                Previous batches
              </Button>
              <span>
                Page {page} of {meta.totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={page >= meta.totalPages || batches.isFetching}
                onClick={() => pages.setValue('page', page + 1)}
              >
                Next batches
              </Button>
            </div>
          )}
          <Button type="submit" disabled={isPending || batches.isError}>
            Record incident
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
