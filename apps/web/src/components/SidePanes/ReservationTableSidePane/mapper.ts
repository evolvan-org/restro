import {
  type AssignReservationTableRequest,
  assignReservationTableRequestSchema,
  type Reservation,
  type RestaurantTable,
} from '@rms/api-contract';
import { z } from 'zod';

const reservationTableFormSchema = assignReservationTableRequestSchema.extend({
  tableId: z.union([assignReservationTableRequestSchema.shape.tableId.unwrap(), z.literal('')]),
});

export type ReservationTableFormValues = z.infer<typeof reservationTableFormSchema>;

export function getReservationTableFormSchema(): typeof reservationTableFormSchema {
  return reservationTableFormSchema;
}

export function toReservationTableFormDefaults(
  reservation: Reservation,
): ReservationTableFormValues {
  return { tableId: reservation.tableId ?? '' };
}

export function toReservationTableRequest(
  values: ReservationTableFormValues,
): AssignReservationTableRequest {
  return assignReservationTableRequestSchema.parse({ tableId: values.tableId || null });
}

export function getReservationTableFormSettings(reservation: Reservation): {
  title: string;
  description: string;
  submit: string;
  hint: string;
} {
  return {
    title: reservation.tableId ? 'Change table' : 'Assign table',
    description: `Choose a table for ${reservation.guest.guestName}, party of ${reservation.partySize}.`,
    submit: 'Save assignment',
    hint: 'Capacity and overlapping reservations are checked when you save. Table status is shown for reference.',
  };
}

export function getAssignmentTableLabel(table: RestaurantTable, partySize: number): string {
  const capacityHint = table.capacity < partySize ? ' - Too small for this party' : '';
  return `Table ${table.tableNumber} - ${table.capacity} seats - ${table.currentStatus.name}${capacityHint}`;
}
