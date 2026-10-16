import {
  type CancelReservationRequest,
  cancelReservationRequestSchema,
  type Reservation,
} from '@rms/api-contract';

export function getCancellationFormSettings(reservation: Reservation): {
  title: string;
  description: string;
  reasonLabel: string;
  reasonHint: string;
  keepLabel: string;
  submitLabel: string;
  pendingLabel: string;
} {
  return {
    title: `Cancel reservation for ${reservation.guest.guestName}?`,
    description: 'The reservation will be marked cancelled and any held table will be released.',
    reasonLabel: 'Cancellation reason',
    reasonHint: 'Optional, up to 255 characters.',
    keepLabel: 'Keep reservation',
    submitLabel: 'Cancel reservation',
    pendingLabel: 'Cancelling...',
  };
}

export function getCancellationFormSchema(): typeof cancelReservationRequestSchema {
  return cancelReservationRequestSchema;
}

export function toCancellationFormDefaults(): CancelReservationRequest {
  return { reason: '' };
}
