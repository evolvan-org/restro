import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './common';

/** Decimal wire values; never transport billing money through binary floats. */
export const billMoneySchema = z.string().regex(/^\d{1,10}\.\d{2}$/);
export const billStatusSchema = z.enum(['OPEN', 'PAID', 'CANCELLED']);
export const paymentMethodSchema = z.enum(['CASH', 'CARD', 'UPI']);
export const generateBillRequestSchema = z.object({}).strict();
export const billListQuerySchema = paginationQuerySchema
  .extend({ status: billStatusSchema.optional() })
  .strict();

export const billLineSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    quantity: z.number().int().positive(),
    unitPrice: billMoneySchema,
    amount: billMoneySchema,
  })
  .strict();

export const billSchema = z
  .object({
    id: z.string().uuid(),
    orderId: z.string().uuid(),
    table: z.object({ id: z.string().uuid(), tableNumber: z.string() }).strict(),
    billNumber: z.string().regex(/^INV-\d{4}-\d{6,}$/),
    generatedByUserId: z.string().uuid(),
    generatedAt: z.string().datetime(),
    paidAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime(),
    status: billStatusSchema,
    subtotal: billMoneySchema,
    discountAmount: billMoneySchema,
    gstRate: z.string().regex(/^\d{1,3}\.\d{2}$/),
    gstAmount: billMoneySchema,
    totalAmount: billMoneySchema,
    cancellationReason: z.string().nullable(),
    currency: z.string(),
    timezone: z.string(),
    maxDiscountPercent: z.string().regex(/^\d{1,3}\.\d{2}$/),
    lines: z.array(billLineSchema),
  })
  .strict();

export const billListResponseSchema = paginatedResponseSchema(billSchema);
export const updateBillRequestSchema = z
  .object({
    discount: z
      .object({
        type: z.enum(['AMOUNT', 'PERCENT']),
        value: z
          .string()
          .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Use a non-negative decimal with up to 2 decimals'),
      })
      .strict()
      .optional(),
    resyncItems: z.literal(true).optional(),
  })
  .strict()
  .refine((input) => input.discount !== undefined || input.resyncItems === true, {
    message: 'Provide a discount or request an item resync',
  });
export const cancelBillRequestSchema = z
  .object({ reason: z.string().trim().max(255).optional() })
  .strict();

export const billCancellationReasonSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string().min(1).max(255),
  })
  .strict();
export const billCancellationReasonsResponseSchema = z.array(billCancellationReasonSchema);
export type BillCancellationReasonsResponse = z.infer<typeof billCancellationReasonsResponseSchema>;

export const recordPaymentRequestSchema = z
  .object({
    paymentMethod: paymentMethodSchema,
    amount: billMoneySchema,
    referenceNumber: z.string().trim().max(255).optional(),
  })
  .strict();

export const paymentSchema = z
  .object({
    id: z.string().uuid(),
    billId: z.string().uuid(),
    recordedByUserId: z.string().uuid(),
    paymentMethod: paymentMethodSchema,
    amount: billMoneySchema,
    status: z.enum(['PENDING', 'COMPLETED', 'FAILED']),
    referenceNumber: z.string().nullable(),
    paidAt: z.string().datetime().nullable(),
  })
  .strict();

export const recordPaymentResponseSchema = z
  .object({
    payment: paymentSchema,
    bill: billSchema,
    order: z
      .object({
        id: z.string().uuid(),
        status: z.literal('COMPLETED'),
        completedAt: z.string().datetime().nullable(),
      })
      .strict(),
  })
  .strict();

export const billInvoiceSchema = z
  .object({
    bill: billSchema,
    restaurant: z
      .object({
        name: z.string(),
        address: z.string().nullable(),
        gstNumber: z.string().nullable(),
      })
      .strict(),
    cgst: z.object({ rate: z.string(), amount: billMoneySchema }).strict(),
    sgst: z.object({ rate: z.string(), amount: billMoneySchema }).strict(),
    // Read-only invoice summary, not a payment-recording request contract.
    payment: z
      .object({
        method: paymentMethodSchema,
        referenceNumber: z.string().nullable(),
        paidAt: z.string().datetime().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type Bill = z.infer<typeof billSchema>;
export type BillListQuery = z.infer<typeof billListQuerySchema>;
export type BillListResponse = z.infer<typeof billListResponseSchema>;
export type UpdateBillRequest = z.infer<typeof updateBillRequestSchema>;
export type CancelBillRequest = z.infer<typeof cancelBillRequestSchema>;
export type BillInvoice = z.infer<typeof billInvoiceSchema>;

export type GenerateBillRequest = z.infer<typeof generateBillRequestSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type RecordPaymentRequest = z.infer<typeof recordPaymentRequestSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type RecordPaymentResponse = z.infer<typeof recordPaymentResponseSchema>;
