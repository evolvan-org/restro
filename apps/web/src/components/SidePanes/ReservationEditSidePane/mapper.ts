import {
  type Reservation,
  updateReservationGuestSchema,
  type UpdateReservationRequest,
  updateReservationRequestSchema,
} from '@rms/api-contract';
import { z } from 'zod';

const reservationEditFormSchema = updateReservationRequestSchema.extend({
  reservationAt: z
    .string()
    .min(1, 'Reservation date and time is required')
    .refine((value) => Number.isFinite(new Date(value).getTime()), {
      message: 'Reservation date and time must be valid',
    }),
  partySize: updateReservationRequestSchema.shape.partySize.unwrap(),
  guest: updateReservationGuestSchema.required(),
});

export type ReservationEditFormValues = z.infer<typeof reservationEditFormSchema>;

const editFormSettings = {
  title: 'Edit reservation',
  description: 'Update the booking time, party size, notes or guest details.',
  labels: {
    guestName: 'Guest name',
    phoneNumber: 'Phone number',
    partySize: 'Party size',
    reservationAt: 'Date and time',
    notes: 'Notes',
    submit: 'Save changes',
    pending: 'Saving...',
    cancel: 'Cancel',
  },
  hints: {
    guest: "Guest details are shared. Changes update this guest's other reservations too.",
    reservationAt: 'A changed date and time must be in the future.',
    notes: 'Optional, up to 255 characters.',
  },
} as const;

export function getReservationEditFormSettings(): typeof editFormSettings {
  return editFormSettings;
}

export function getReservationEditFormSchema(): typeof reservationEditFormSchema {
  return reservationEditFormSchema;
}

export function toReservationEditFormDefaults(reservation: Reservation): ReservationEditFormValues {
  const localDate = new Date(reservation.reservationAt);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return {
    reservationAt: localDate.toISOString().slice(0, 16),
    partySize: reservation.partySize,
    notes: reservation.notes ?? '',
    guest: {
      guestName: reservation.guest.guestName,
      phoneNumber: reservation.guest.phoneNumber,
    },
  };
}

/** Send only changed fields, preserving omitted values and the original timestamp's precision. */
export function toReservationEditRequest(
  values: ReservationEditFormValues,
  reservation: Reservation,
): UpdateReservationRequest {
  const defaults = toReservationEditFormDefaults(reservation);
  const guest = {
    ...(values.guest.guestName !== defaults.guest.guestName && {
      guestName: values.guest.guestName,
    }),
    ...(values.guest.phoneNumber !== defaults.guest.phoneNumber && {
      phoneNumber: values.guest.phoneNumber,
    }),
  };
  return {
    ...(values.reservationAt !== defaults.reservationAt && {
      reservationAt: new Date(values.reservationAt).toISOString(),
    }),
    ...(values.partySize !== defaults.partySize && { partySize: values.partySize }),
    ...(values.notes !== defaults.notes && { notes: values.notes ?? '' }),
    ...(Object.keys(guest).length > 0 && { guest }),
  };
}
