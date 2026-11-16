import {
  type CreateReservationRequest,
  createReservationRequestSchema,
  type CreateWalkInRequest,
  createWalkInRequestSchema,
  type RestaurantTable,
} from '@rms/api-contract';
import { z } from 'zod';

export type IntakeTable = Pick<RestaurantTable, 'id' | 'tableNumber' | 'capacity'>;
export type IntakeMode = 'WALK_IN' | 'RESERVATION';

function reservationIso(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

export const guestIntakeFormSchema = createReservationRequestSchema
  .omit({ reservationAt: true, tableId: true })
  .extend({
    mode: z.enum(['WALK_IN', 'RESERVATION']),
    tableId: z.string(),
    reservationAt: z.string(),
  })
  .superRefine((values, context) => {
    const field = values.mode === 'WALK_IN' ? 'tableId' : 'reservationAt';
    const result =
      values.mode === 'WALK_IN'
        ? createWalkInRequestSchema.shape.tableId.safeParse(values.tableId)
        : createReservationRequestSchema.shape.reservationAt.safeParse(
            reservationIso(values.reservationAt),
          );
    if (!result.success)
      for (const issue of result.error.issues)
        context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: issue.message });
  });
export type GuestIntakeValues = z.infer<typeof guestIntakeFormSchema>;

export function guestIntakeDefaults(mode: IntakeMode, table?: IntakeTable): GuestIntakeValues {
  return {
    mode,
    guestName: '',
    phoneNumber: '',
    partySize: mode === 'WALK_IN' ? 1 : Math.min(2, table?.capacity ?? 2),
    tableId: table?.id ?? '',
    reservationAt: '',
    notes: '',
  };
}

export function toGuestIntakeRequest(
  values: GuestIntakeValues,
  fixedTableId?: string,
):
  | { mode: 'WALK_IN'; input: CreateWalkInRequest }
  | { mode: 'RESERVATION'; input: CreateReservationRequest } {
  const common = {
    guestName: values.guestName,
    phoneNumber: values.phoneNumber,
    partySize: values.partySize,
    notes: values.notes,
  };
  return values.mode === 'WALK_IN'
    ? {
        mode: 'WALK_IN',
        input: createWalkInRequestSchema.parse({
          ...common,
          tableId: fixedTableId ?? values.tableId,
        }),
      }
    : {
        mode: 'RESERVATION',
        input: createReservationRequestSchema.parse({
          ...common,
          reservationAt: reservationIso(values.reservationAt),
          ...(fixedTableId ? { tableId: fixedTableId } : {}),
        }),
      };
}

export function intakeModeSettings(mode: IntakeMode): {
  description: string;
  submit: string;
  pending: string;
} {
  return mode === 'WALK_IN'
    ? {
        description: 'Seat an arriving guest at an available table.',
        submit: 'Register walk-in',
        pending: 'Registering…',
      }
    : {
        description: 'Book a future visit. A table can be assigned later.',
        submit: 'Book reservation',
        pending: 'Booking…',
      };
}

export function localDateTimeNow(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}
