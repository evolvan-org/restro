import type { CreateOrderRequest } from '@rms/api-contract';
import { z } from 'zod';

export const openOrderFormSchema = z.object({
  reservationId: z.union([z.literal(''), z.string().uuid('Select a reservation')]),
});

export type OpenOrderFormValues = z.infer<typeof openOrderFormSchema>;

export function getOpenOrderFormDefaults(): OpenOrderFormValues {
  return { reservationId: '' };
}

export function toCreateOrderRequest(
  tableId: string,
  values: OpenOrderFormValues,
): CreateOrderRequest {
  return {
    tableId,
    ...(values.reservationId && { reservationId: values.reservationId }),
  };
}
