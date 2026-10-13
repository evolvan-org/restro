import { type CancelReservationRequest, cancelReservationRequestSchema } from '@rms/api-contract';

export function getCancellationFormSchema(): typeof cancelReservationRequestSchema {
  return cancelReservationRequestSchema;
}

export function toCancellationFormDefaults(): CancelReservationRequest {
  return { reason: '' };
}
