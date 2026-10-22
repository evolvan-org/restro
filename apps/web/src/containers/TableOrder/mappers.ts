import type { CreateOrderRequest } from '@rms/api-contract';
import { z } from 'zod';

export const openOrderFormSchema = z.object({
  reservationId: z.union([z.literal(''), z.string().uuid('Select a reservation')]),
});

export type OpenOrderFormValues = z.infer<typeof openOrderFormSchema>;

export function getOpenOrderFormDefaults(reservationId = ''): OpenOrderFormValues {
  return { reservationId };
}

export function toCreateOrderRequest(
  tableId: string,
  values: OpenOrderFormValues,
): CreateOrderRequest {
  if (!values.reservationId) throw new Error('An active reservation is required');
  return {
    tableId,
    reservationId: values.reservationId,
  };
}
