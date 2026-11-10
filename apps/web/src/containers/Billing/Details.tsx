'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type Bill } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import {
  ArrowLeft,
  Banknote,
  FileText,
  ListOrdered,
  RefreshCw,
  RotateCcw,
  Tag,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button, buttonVariants } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import {
  useBill,
  useBillCancellationReasons,
  useCancelBill,
  useGenerateBill,
  useRecordPayment,
  useUpdateBill,
} from '@/services/api/requests/bills';

import styles from './billing.module.css';
import LineItems from './LineItems';
import {
  billStatusLabel,
  cancellationDefaults,
  cancellationFormSchema,
  type CancellationFormValues,
  CUSTOM_CANCELLATION_REASON,
  discountDefaults,
  discountFormSchema,
  type DiscountFormValues,
  paymentDefaults,
  paymentFormSchema,
  type PaymentFormValues,
  paymentNeedsReference,
  toCancellationRequest,
  toDiscountRequest,
  toPaymentRequest,
} from './mappers';
import QueryState from './QueryState';

export default function BillDetails({ id }: { id: string }): ReactElement | null {
  const allowed = usePermissionGuard([Permission.BILL_READ]);
  const bill = useBill(id, allowed);
  if (!allowed) return null;
  return (
    <section className={`${styles.screen} ${styles.detailScreen}`}>
      <div className={styles.content}>
        {bill.data && !bill.isError && (
          <Link href={`/orders/tables/${bill.data.table.id}`} className={styles.backLink}>
            <ArrowLeft className="size-4" aria-hidden /> Back to order menu
          </Link>
        )}
        <QueryState pending={bill.isPending} error={bill.error} retry={() => void bill.refetch()} />
        {bill.data && !bill.isError && <BillContent bill={bill.data} />}
      </div>
    </section>
  );
}

function BillContent({ bill }: { bill: Bill }): ReactElement {
  const { can } = usePermissions();
  const { mutateAsync: updateBill, isPending: updating } = useUpdateBill();
  const { mutateAsync: cancelBill, isPending: cancelling } = useCancelBill();
  const { mutateAsync: reopenBill, isPending: reopening } = useGenerateBill();
  const { mutateAsync: recordPayment, isPending: paying } = useRecordPayment();
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const open = bill.status === 'OPEN';
  const reasons = useBillCancellationReasons(open && can(Permission.BILL_CANCEL));
  const discount = useForm<DiscountFormValues>({
    resolver: zodResolver(discountFormSchema),
    defaultValues: discountDefaults(bill),
  });
  const cancellation = useForm<CancellationFormValues>({
    resolver: zodResolver(cancellationFormSchema),
    defaultValues: cancellationDefaults(),
  });
  const selectedReason = useWatch({ control: cancellation.control, name: 'reason' });
  const payment = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: paymentDefaults(),
  });
  const paymentMethod = useWatch({ control: payment.control, name: 'paymentMethod' });
  const needsReference = paymentNeedsReference(paymentMethod);
  const { reset: resetDiscount } = discount;
  const { reset: resetCancellation } = cancellation;
  useEffect(() => {
    resetDiscount(discountDefaults(bill));
    resetCancellation(cancellationDefaults());
  }, [bill, resetDiscount, resetCancellation]);
  const busy = updating || cancelling || reopening || paying;
  async function resync(): Promise<void> {
    try {
      await updateBill({ id: bill.id, input: { resyncItems: true } });
    } catch {
      /* Request hook reports the failure; keep the existing bill. */
    }
  }
  async function reopen(): Promise<void> {
    try {
      await reopenBill(bill.orderId);
    } catch {
      /* Request hook reports the failure. */
    }
  }
  return (
    <>
      <header className={`${styles.toolbar} mt-3`}>
        <div className="min-w-0">
          <p className="mb-2 text-sm text-muted-foreground">Table {bill.table.tableNumber}</p>
          <h1 className={styles.title}>{bill.billNumber}</h1>
          <p className={styles.subtitle}>
            <time dateTime={bill.generatedAt}>
              {new Date(bill.generatedAt).toLocaleString(undefined, { timeZone: bill.timezone })}
            </time>
          </p>
        </div>
        <span className={styles.status} data-status={bill.status}>
          {billStatusLabel(bill.status)}
        </span>
      </header>
      <div className={styles.workspace}>
        <section className={`${styles.panel} ${styles.itemsPanel}`} aria-label="Bill items">
          <div className={styles.panelHeading}>
            <h2 className={styles.sectionTitle}>
              <ListOrdered className="size-4 text-muted-foreground" aria-hidden /> Order items{' '}
              <span className="text-sm font-normal text-muted-foreground">
                ({bill.lines.length})
              </span>
            </h2>
            {open && can(Permission.BILL_UPDATE) && (
              <Button
                variant="outline"
                className={styles.touchButton}
                disabled={busy}
                onClick={() => void resync()}
              >
                <RefreshCw className="size-4" aria-hidden />
                {updating ? 'Saving…' : 'Resync items'}
              </Button>
            )}
          </div>
          <LineItems lines={bill.lines} />
          <p className="mt-5 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
            Current order items are shown here. Use Resync items to update the saved bill totals
            after changing the order.
          </p>
        </section>
        <aside className={styles.tools} aria-label="Bill summary and actions">
          <section className={styles.panel} aria-label="Bill totals">
            <h2 className={`${styles.sectionTitle} mb-5`}>Bill summary</h2>
            <dl className={styles.totals}>
              <dt>Subtotal</dt>
              <dd>{bill.subtotal}</dd>
              <dt>Discount</dt>
              <dd>{bill.discountAmount}</dd>
              <dt>GST ({bill.gstRate}%)</dt>
              <dd>{bill.gstAmount}</dd>
              <dt className={styles.totalLabel}>Total</dt>
              <dd className={styles.totalValue}>
                {bill.currency} {bill.totalAmount}
              </dd>
            </dl>
            {bill.status !== 'CANCELLED' && (
              <Link
                href={`/billing/${bill.id}/invoice`}
                className={`${buttonVariants()} ${styles.summaryAction}`}
              >
                <FileText aria-hidden /> View / print invoice
              </Link>
            )}
          </section>
          {bill.status === 'PAID' && (
            <section className={`${styles.panel} space-y-2`}>
              <h2 className={styles.sectionTitle}>Payment received</h2>
              <p className={styles.note}>
                {bill.paidAt
                  ? `Paid ${new Date(bill.paidAt).toLocaleString(undefined, { timeZone: bill.timezone })}.`
                  : 'Paid.'}{' '}
                Method and reference are shown on the invoice.
              </p>
            </section>
          )}
          {bill.status === 'CANCELLED' && (
            <section className={`${styles.panel} space-y-4`}>
              <h2 className={styles.sectionTitle}>Bill cancelled</h2>
              <p className={styles.note}>{bill.cancellationReason || 'No reason provided.'}</p>
              {can(Permission.BILL_GENERATE) && (
                <>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Reopening replaces the cancelled contents and clears the reason and discount.
                    The original invoice number, date and GST rate are retained. The order must
                    still be submitted.
                  </p>
                  <Button
                    className={`${styles.touchButton} w-full`}
                    disabled={busy}
                    onClick={() => void reopen()}
                  >
                    <RotateCcw aria-hidden />
                    {reopening ? 'Reopening…' : 'Reopen bill'}
                  </Button>
                </>
              )}
            </section>
          )}
          {open && can(Permission.PAYMENT_WRITE) && (
            <form
              className={`${styles.panel} ${styles.form}`}
              noValidate
              onSubmit={payment.handleSubmit(async (values) => {
                if (!confirmingPayment) {
                  setConfirmingPayment(true);
                  return;
                }
                try {
                  await recordPayment({ id: bill.id, input: toPaymentRequest(bill, values) });
                  payment.reset(paymentDefaults());
                } catch {
                  /* Hook owns the error; retain form values. */
                } finally {
                  setConfirmingPayment(false);
                }
              })}
            >
              <h2 className={styles.sectionTitle}>
                <Banknote className="size-4 text-muted-foreground" aria-hidden /> Record payment
              </h2>
              <div className={styles.formFields}>
                <label>
                  Method
                  <NativeSelect
                    {...payment.register('paymentMethod', {
                      onChange: () => setConfirmingPayment(false),
                    })}
                    disabled={busy}
                  >
                    <NativeSelectOption value="CASH">Cash</NativeSelectOption>
                    <NativeSelectOption value="CARD">Card</NativeSelectOption>
                    <NativeSelectOption value="UPI">UPI</NativeSelectOption>
                  </NativeSelect>
                </label>
                <label>
                  Amount
                  <Input value={bill.totalAmount} readOnly disabled />
                </label>
              </div>
              {needsReference && (
                <label>
                  {paymentMethod === 'CARD' ? 'Card slip reference' : 'UPI transaction id'}{' '}
                  (optional)
                  <Input
                    maxLength={255}
                    {...payment.register('referenceNumber', {
                      onChange: () => setConfirmingPayment(false),
                    })}
                    disabled={busy}
                    aria-invalid={Boolean(payment.formState.errors.referenceNumber)}
                    aria-describedby="bill-payment-error"
                  />
                </label>
              )}
              <FieldError id="bill-payment-error">
                {payment.formState.errors.referenceNumber?.message}
              </FieldError>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {confirmingPayment
                  ? `Confirm receiving ${bill.currency} ${bill.totalAmount} by ${paymentMethod}. A recorded payment cannot be edited, and the bill and order will be closed.`
                  : 'The full bill total is settled in one payment. Split payments are not supported.'}
              </p>
              <div className="flex gap-2">
                <Button type="submit" className={`${styles.touchButton} flex-1`} disabled={busy}>
                  {paying ? 'Recording…' : confirmingPayment ? 'Confirm payment' : 'Mark as paid'}
                </Button>
                {confirmingPayment && !paying && (
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.touchButton}
                    onClick={() => setConfirmingPayment(false)}
                  >
                    Back
                  </Button>
                )}
              </div>
            </form>
          )}
          {open && can(Permission.BILL_UPDATE) && can(Permission.BILL_DISCOUNT) && (
            <form
              className={`${styles.panel} ${styles.form}`}
              noValidate
              onSubmit={discount.handleSubmit(async (values) => {
                try {
                  await updateBill({ id: bill.id, input: toDiscountRequest(values) });
                } catch {
                  /* Hook owns the error; retain form values. */
                }
              })}
            >
              <h2 className={styles.sectionTitle}>
                <Tag className="size-4 text-muted-foreground" aria-hidden /> Discount
              </h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Up to {bill.maxDiscountPercent}% of subtotal. GST applies after discount. Enter zero
                to remove it.
              </p>
              <div className={styles.formFields}>
                <label>
                  Type
                  <NativeSelect {...discount.register('type')} disabled={busy}>
                    <NativeSelectOption value="PERCENT">Percentage</NativeSelectOption>
                    <NativeSelectOption value="AMOUNT">Amount</NativeSelectOption>
                  </NativeSelect>
                </label>
                <label>
                  Value
                  <Input
                    inputMode="decimal"
                    {...discount.register('value')}
                    disabled={busy}
                    aria-invalid={Boolean(discount.formState.errors.value)}
                    aria-describedby="bill-discount-error"
                  />
                </label>
              </div>
              <FieldError id="bill-discount-error">
                {discount.formState.errors.value?.message}
              </FieldError>
              <Button
                type="submit"
                variant="outline"
                className={styles.touchButton}
                disabled={busy}
              >
                {updating ? 'Saving…' : 'Apply discount'}
              </Button>
            </form>
          )}
          {open && can(Permission.BILL_CANCEL) && (
            <form
              className={`${styles.panel} ${styles.form}`}
              noValidate
              onSubmit={cancellation.handleSubmit(async (values) => {
                try {
                  await cancelBill({ id: bill.id, input: toCancellationRequest(values) });
                } catch {
                  /* Hook owns the error; retain form values. */
                }
              })}
            >
              <h2 className={styles.sectionTitle}>
                <X className="size-4 text-muted-foreground" aria-hidden /> Cancel bill
              </h2>
              <label>
                Reason (optional)
                <NativeSelect
                  {...cancellation.register('reason')}
                  disabled={busy}
                  aria-invalid={Boolean(cancellation.formState.errors.reason)}
                  aria-describedby="bill-cancellation-error"
                >
                  <NativeSelectOption value="">No reason selected</NativeSelectOption>
                  {reasons.data?.map((reason) => (
                    <NativeSelectOption key={reason.id} value={reason.name}>
                      {reason.name}
                    </NativeSelectOption>
                  ))}
                  <NativeSelectOption value={CUSTOM_CANCELLATION_REASON}>
                    Custom reason…
                  </NativeSelectOption>
                </NativeSelect>
              </label>
              {selectedReason === CUSTOM_CANCELLATION_REASON && (
                <label>
                  Custom reason (optional)
                  <Input
                    maxLength={255}
                    {...cancellation.register('customReason')}
                    disabled={busy}
                    aria-invalid={Boolean(cancellation.formState.errors.customReason)}
                    aria-describedby="bill-cancellation-error"
                  />
                </label>
              )}
              {reasons.isPending && <p role="status">Loading predefined reasons…</p>}
              {reasons.isError && (
                <div role="alert" className="space-y-2 text-sm">
                  <p>Unable to load predefined reasons. You can still enter a custom reason.</p>
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.touchButton}
                    disabled={reasons.isFetching}
                    onClick={() => void reasons.refetch()}
                  >
                    Retry reasons
                  </Button>
                </div>
              )}
              <FieldError id="bill-cancellation-error">
                {cancellation.formState.errors.reason?.message ||
                  cancellation.formState.errors.customReason?.message}
              </FieldError>
              <Button
                type="submit"
                variant="destructive"
                className={styles.touchButton}
                disabled={busy}
              >
                {cancelling ? 'Cancelling…' : 'Cancel bill'}
              </Button>
            </form>
          )}
        </aside>
      </div>
      {bill.status !== 'CANCELLED' && (
        <div className={styles.mobileBar}>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Bill total</p>
            <p className={styles.amount}>
              {bill.currency} {bill.totalAmount}
            </p>
          </div>
          <Link
            href={`/billing/${bill.id}/invoice`}
            className={`${buttonVariants()} ${styles.touchButton}`}
          >
            <FileText aria-hidden /> View invoice
          </Link>
        </div>
      )}
    </>
  );
}
