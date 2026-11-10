'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateBillCancellationReasonRequest,
  createBillCancellationReasonRequestSchema,
  type ManagedBillCancellationReason,
  type RenameBillCancellationReasonRequest,
  renameBillCancellationReasonRequestSchema,
} from '@rms/api-contract';
import { Ban, Check, LoaderCircle, Plus } from 'lucide-react';
import { type ReactElement, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  useCreateBillCancellationReason,
  useDeactivateBillCancellationReason,
  useManagedBillCancellationReasons,
  useRenameBillCancellationReason,
} from '@/services/api/requests/bill-cancellation-reasons';

import {
  cancellationReasonDefaults,
  type CancellationReasonPagination,
  cancellationReasonPaginationDefaults,
  cancellationReasonPaginationSchema,
} from './cancellation-reason-mappers';
import styles from './cancellation-reasons.module.css';

export default function BillCancellationReasons(): ReactElement {
  const pagination = useForm<CancellationReasonPagination>({
    resolver: zodResolver(cancellationReasonPaginationSchema),
    defaultValues: cancellationReasonPaginationDefaults(),
  });
  const page = useWatch({ control: pagination.control, name: 'page' });
  const reasons = useManagedBillCancellationReasons({ page, pageSize: 10 }, true);
  const {
    mutateAsync: createReason,
    isPending: creating,
    isSuccess: created,
  } = useCreateBillCancellationReason();
  const form = useForm<CreateBillCancellationReasonRequest>({
    resolver: zodResolver(createBillCancellationReasonRequestSchema),
    defaultValues: cancellationReasonDefaults(),
  });
  const { reset } = form;
  useEffect(() => {
    if (created) reset(cancellationReasonDefaults());
  }, [created, reset]);

  return (
    <Card size="sm" className="mt-6 min-w-0" id="bill-cancellation-reasons">
      <CardHeader>
        <CardTitle>Bill cancellation reasons</CardTitle>
        <CardDescription>
          Manage cancellation choices. Previously cancelled bills keep their saved reason.
        </CardDescription>
      </CardHeader>
      <CardContent className={styles.catalog}>
        <form
          noValidate
          className={styles.addForm}
          onSubmit={form.handleSubmit(async (input) => {
            try {
              await createReason(input);
            } catch {
              /* Request hook reports failures; retain the draft. */
            }
          })}
        >
          <Field className="min-w-0">
            <FieldLabel className="sr-only" htmlFor="new-bill-cancellation-reason">
              New reason
            </FieldLabel>
            <Input
              id="new-bill-cancellation-reason"
              className="min-h-11 text-base"
              placeholder="New cancellation reason"
              maxLength={255}
              disabled={creating}
              {...form.register('name')}
              aria-invalid={Boolean(form.formState.errors.name)}
              aria-describedby="new-bill-cancellation-reason-error"
            />
            <FieldError id="new-bill-cancellation-reason-error">
              {form.formState.errors.name?.message}
            </FieldError>
          </Field>
          <Button type="submit" className="min-h-11" disabled={creating} aria-label="Add reason">
            {creating ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Plus aria-hidden />
            )}
            {creating ? 'Adding…' : 'Add'}
          </Button>
        </form>
        {reasons.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading bill cancellation reasons…
          </p>
        )}
        {reasons.isError && (
          <div role="alert" className="space-y-3 text-sm">
            <p>{getApiErrorMessage(reasons.error, 'Unable to load bill cancellation reasons.')}</p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={reasons.isFetching}
              onClick={() => void reasons.refetch()}
            >
              Retry reasons
            </Button>
          </div>
        )}
        {reasons.data && !reasons.isError && (
          <>
            {reasons.data.data.length === 0 && (
              <p className="text-sm text-muted-foreground">No bill cancellation reasons yet.</p>
            )}
            <ul className={styles.list} aria-label="Bill cancellation reasons">
              {reasons.data.data.map((reason) => (
                <li key={reason.id} className="min-w-0">
                  <ReasonRow reason={reason} disabled={reasons.isPlaceholderData} />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p>
                Page {page} of {Math.max(1, reasons.data.meta.totalPages)} ·{' '}
                {reasons.data.meta.total} reasons
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={page <= 1 || reasons.isPlaceholderData}
                  onClick={() => pagination.setValue('page', page - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={page >= reasons.data.meta.totalPages || reasons.isPlaceholderData}
                  onClick={() => pagination.setValue('page', page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReasonRow({
  reason,
  disabled,
}: {
  reason: ManagedBillCancellationReason;
  disabled: boolean;
}): ReactElement {
  const { mutateAsync: renameReason, isPending: renaming } = useRenameBillCancellationReason();
  const { mutateAsync: deactivateReason, isPending: deactivating } =
    useDeactivateBillCancellationReason();
  const form = useForm<RenameBillCancellationReasonRequest>({
    resolver: zodResolver(renameBillCancellationReasonRequestSchema),
    defaultValues: cancellationReasonDefaults(reason.name),
  });
  const { reset } = form;
  useEffect(() => {
    reset(cancellationReasonDefaults(reason.name));
  }, [reason.name, reset]);
  const busy = disabled || renaming || deactivating;
  const inputId = `bill-cancellation-reason-${reason.id}`;
  return (
    <form
      noValidate
      className={styles.row}
      aria-label={`Edit reason: ${reason.name}`}
      onSubmit={form.handleSubmit(async (input) => {
        try {
          await renameReason({ id: reason.id, input });
        } catch {
          /* Request hook reports failures; retain the draft. */
        }
      })}
    >
      <Field className={styles.nameField}>
        <FieldLabel className="sr-only" htmlFor={inputId}>
          Reason
        </FieldLabel>
        <Input
          id={inputId}
          className="min-h-11 text-base"
          maxLength={255}
          disabled={busy || !reason.isActive}
          {...form.register('name')}
          aria-invalid={Boolean(form.formState.errors.name)}
          aria-describedby={`${inputId}-error`}
        />
        <FieldError id={`${inputId}-error`}>{form.formState.errors.name?.message}</FieldError>
      </Field>
      <span className={styles.status} data-active={reason.isActive}>
        {reason.isActive ? 'Active' : 'Inactive'}
      </span>
      {reason.isActive && (
        <div className={styles.actions}>
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Save reason"
            title="Save reason"
            disabled={busy || !form.formState.isDirty}
          >
            {renaming ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Check aria-hidden />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Deactivate"
            title="Deactivate reason"
            disabled={busy}
            onClick={async () => {
              try {
                await deactivateReason(reason.id);
              } catch {
                /* Request hook reports failures; keep the row. */
              }
            }}
          >
            {deactivating ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Ban aria-hidden />
            )}
          </Button>
        </div>
      )}
    </form>
  );
}
