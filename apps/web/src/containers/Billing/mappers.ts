import {
  type Bill,
  billStatusSchema,
  cancelBillRequestSchema,
  type PaymentMethod,
  type RecordPaymentRequest,
  recordPaymentRequestSchema,
  type UpdateBillRequest,
  updateBillRequestSchema,
} from '@rms/api-contract';
import { z } from 'zod';

export const billingFiltersSchema = z.object({
  status: z.union([z.literal(''), billStatusSchema]),
  page: z.number().int().min(1),
});
export type BillingFilters = z.infer<typeof billingFiltersSchema>;
export function billingFilterDefaults(): BillingFilters {
  return { status: '', page: 1 };
}
export const discountFormSchema = z.object({
  type: z.enum(['AMOUNT', 'PERCENT']),
  value: z
    .string()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter a non-negative amount with up to 2 decimals'),
});
export type DiscountFormValues = z.infer<typeof discountFormSchema>;
export function discountDefaults(bill: Bill): DiscountFormValues {
  const subtotal = BigInt(bill.subtotal.replace('.', ''));
  const discount = BigInt(bill.discountAmount.replace('.', ''));
  // Convert saved money to a percentage with exact half-up rounding to two decimals.
  const percentage = subtotal > 0n ? (discount * 10_000n + subtotal / 2n) / subtotal : 0n;
  return {
    type: 'PERCENT',
    value: `${percentage / 100n}.${(percentage % 100n).toString().padStart(2, '0')}`,
  };
}
export function toDiscountRequest(discount: DiscountFormValues): UpdateBillRequest {
  return updateBillRequestSchema.parse({ discount });
}
export const CUSTOM_CANCELLATION_REASON = '__custom__';
export const cancellationFormSchema = z.object({
  reason: z.string().max(255),
  customReason: cancelBillRequestSchema.shape.reason.unwrap(),
});
export type CancellationFormValues = z.infer<typeof cancellationFormSchema>;
export function cancellationDefaults(): z.infer<typeof cancellationFormSchema> {
  return { reason: '', customReason: '' };
}
export function toCancellationRequest(
  values: CancellationFormValues,
): z.infer<typeof cancelBillRequestSchema> {
  return cancelBillRequestSchema.parse({
    reason: values.reason === CUSTOM_CANCELLATION_REASON ? values.customReason : values.reason,
  });
}

export function billStatusLabel(status: Bill['status']): string {
  return { OPEN: 'Open', PAID: 'Paid', CANCELLED: 'Cancelled' }[status];
}

export const paymentFormSchema = z.object({
  paymentMethod: z.enum(['CASH', 'CARD', 'UPI']),
  referenceNumber: z.string().trim().max(255, 'Use at most 255 characters'),
});
export type PaymentFormValues = z.infer<typeof paymentFormSchema>;
export function paymentDefaults(): PaymentFormValues {
  return { paymentMethod: 'CASH', referenceNumber: '' };
}
export function paymentNeedsReference(method: PaymentMethod): boolean {
  return method !== 'CASH';
}
/** Amount is always the bill total: full settlement, no split payment. */
export function toPaymentRequest(bill: Bill, values: PaymentFormValues): RecordPaymentRequest {
  return recordPaymentRequestSchema.parse({
    paymentMethod: values.paymentMethod,
    amount: bill.totalAmount,
    ...(paymentNeedsReference(values.paymentMethod) &&
      values.referenceNumber && { referenceNumber: values.referenceNumber }),
  });
}
