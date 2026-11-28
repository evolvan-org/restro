import {
  type Bill,
  type BillCancellationReasonsResponse,
  billStatusSchema,
  cancelBillRequestSchema,
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

const optionalPaymentAmount = z
  .string()
  .trim()
  .regex(/^(?:\d{1,10}(?:\.\d{1,2})?)?$/, 'Enter a non-negative amount with up to 2 decimals');
const optionalPaymentReference = z.string().trim().max(255, 'Use at most 255 characters');

export const splitPaymentFields = [
  { method: 'CASH', label: 'Cash', amount: 'cashAmount', reference: null },
  { method: 'CARD', label: 'Card', amount: 'cardAmount', reference: 'cardReference' },
  { method: 'UPI', label: 'UPI', amount: 'upiAmount', reference: 'upiReference' },
] as const;

export const paymentFormSchema = z
  .object({
    paymentMethod: z.enum(['CASH', 'CARD', 'UPI', 'MIXED']),
    tip: optionalPaymentAmount,
    referenceNumber: optionalPaymentReference,
    cashAmount: z.string(),
    cardAmount: z.string(),
    upiAmount: z.string(),
    cardReference: optionalPaymentReference,
    upiReference: optionalPaymentReference,
  })
  .superRefine((values, context) => {
    if (values.paymentMethod !== 'MIXED') return;
    for (const { amount } of splitPaymentFields) {
      const result = optionalPaymentAmount.safeParse(values[amount]);
      if (!result.success) {
        context.addIssue({
          code: 'custom',
          path: [amount],
          message: result.error.issues[0]?.message,
        });
      }
    }
  });
export type PaymentFormValues = z.infer<typeof paymentFormSchema>;
export function paymentDefaults(): PaymentFormValues {
  return {
    paymentMethod: 'CASH',
    referenceNumber: '',
    tip: '',
    cashAmount: '',
    cardAmount: '',
    upiAmount: '',
    cardReference: '',
    upiReference: '',
  };
}
export function paymentNeedsReference(method: PaymentFormValues['paymentMethod']): boolean {
  return method === 'CARD' || method === 'UPI';
}
function cents(value: string): bigint {
  const [whole = '', decimal = ''] = value.trim().split('.');
  return BigInt(whole || '0') * 100n + BigInt(decimal.padEnd(2, '0'));
}
function asPaymentAmount(minor: bigint): string {
  return (minor / 100n).toString() + '.' + (minor % 100n).toString().padStart(2, '0');
}
export function paymentTotalWithTip(total: string, tip: string): string | null {
  if (!optionalPaymentAmount.safeParse(tip).success) return null;
  const minor = cents(total) + cents(tip);
  return minor <= 999999999999n ? asPaymentAmount(minor) : null;
}

export function summarizeSplitPayment(total: string, values: Partial<PaymentFormValues>) {
  const amounts = splitPaymentFields.map((field) =>
    optionalPaymentAmount.safeParse(values[field.amount] ?? ''),
  );
  if (amounts.some((amount) => !amount.success)) return null;
  let received = 0n;
  const tenders = splitPaymentFields.flatMap(({ method, reference }, index) => {
    const amount = cents(amounts[index]?.data ?? '');
    if (amount === 0n) return [];
    received += amount;
    const referenceNumber = reference ? values[reference]?.trim() : undefined;
    return [
      { method, amount: asPaymentAmount(amount), ...(referenceNumber && { referenceNumber }) },
    ];
  });
  const balance = cents(total) - received;
  return {
    tenders,
    balance: asPaymentAmount(balance < 0n ? -balance : balance),
    overpaid: balance < 0n,
    ready: balance === 0n && tenders.length >= 2,
  };
}
export function toPaymentRequest(values: PaymentFormValues, total: string): RecordPaymentRequest {
  const split = values.paymentMethod === 'MIXED' ? summarizeSplitPayment(total, values) : null;
  return recordPaymentRequestSchema.parse({
    paymentMethod: split?.tenders[0]?.method ?? values.paymentMethod,
    amount: total,
    ...(split && { tenders: split.tenders }),
    ...(values.tip && { tipAmount: paymentTotalWithTip('0.00', values.tip) }),
    ...(paymentNeedsReference(values.paymentMethod) &&
      values.referenceNumber && { referenceNumber: values.referenceNumber }),
  });
}
