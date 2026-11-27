import {
  type Bill,
  type BillCancellationReasonsResponse,
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
  return { type: 'AMOUNT', value: bill.discountAmount };
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
  reasons: BillCancellationReasonsResponse,
): z.infer<typeof cancelBillRequestSchema> {
  return cancelBillRequestSchema.parse({
    reason:
      values.reason === CUSTOM_CANCELLATION_REASON
        ? values.customReason
        : reasons.find((reason) => reason.id === values.reason)?.name,
  });
}

export function billStatusLabel(status: Bill['status']): string {
  return { OPEN: 'Open', PAID: 'Paid', CANCELLED: 'Cancelled' }[status];
}

export const paymentFormSchema = z.object({
  paymentMethod: z.enum(['CASH', 'CARD', 'UPI']),
  tip: z
    .string()
    .trim()
    .regex(/^(?:\d{1,10}(?:\.\d{1,2})?)?$/, 'Enter a non-negative amount with up to 2 decimals'),
  referenceNumber: z.string().trim().max(255, 'Use at most 255 characters'),
});
export type PaymentFormValues = z.infer<typeof paymentFormSchema>;
export function paymentDefaults(): PaymentFormValues {
  return { paymentMethod: 'CASH', referenceNumber: '', tip: '' };
}
export function paymentNeedsReference(method: PaymentMethod): boolean {
  return method !== 'CASH';
}
export function paymentTotalWithTip(total: string, tip: string): string | null {
  if (!paymentFormSchema.shape.tip.safeParse(tip).success) return null;
  const cents = (value: string): bigint => {
    const [whole = '', decimal = ''] = value.trim().split('.');
    return BigInt(whole || '0') * 100n + BigInt(decimal.padEnd(2, '0'));
  };
  const minor = cents(total) + cents(tip);
  return minor <= 999999999999n
    ? (minor / 100n).toString() + '.' + (minor % 100n).toString().padStart(2, '0')
    : null;
}
export function toPaymentRequest(bill: Bill, values: PaymentFormValues): RecordPaymentRequest {
  return recordPaymentRequestSchema.parse({
    paymentMethod: values.paymentMethod,
    amount: paymentTotalWithTip(bill.totalAmount, values.tip),
    ...(values.tip && { tipAmount: paymentTotalWithTip('0.00', values.tip) }),
    ...(paymentNeedsReference(values.paymentMethod) &&
      values.referenceNumber && { referenceNumber: values.referenceNumber }),
  });
}
