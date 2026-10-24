import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './common';
import { restaurantTableSchema } from './tables';

// Preserve the existing export while keeping the constant's definition in @rms/shared.
export { RESERVATION_DURATION_MINUTES } from '@rms/shared';

/** Upper bound for a single party; also keeps the value inside Postgres INT4. */
export const MAX_PARTY_SIZE = 1000;

const guestNameSchema = z
  .string()
  .trim()
  .min(1, 'Guest name is required')
  .max(255, 'Guest name must be 255 characters or fewer');

const guestPhoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .max(30, 'Phone number must be 30 characters or fewer');

function withPartySizeConstraints(schema: z.ZodNumber): z.ZodNumber {
  return schema
    .int('Party size must be a whole number')
    .min(1, 'Party size must be at least 1')
    .max(MAX_PARTY_SIZE, `Party size must be ${MAX_PARTY_SIZE} or fewer`);
}

const partySizeSchema = withPartySizeConstraints(
  z.coerce.number({ invalid_type_error: 'Party size is required' }),
);

const updatePartySizeSchema = withPartySizeConstraints(
  z.number({ invalid_type_error: 'Party size must be a number' }),
);

const reservationNotesSchema = z
  .string()
  .trim()
  .max(255, 'Notes must be 255 characters or fewer')
  .optional();

export const reservationStatusSchema = z.enum([
  'BOOKED',
  'SEATED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);

export const TERMINAL_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  'CANCELLED',
  'COMPLETED',
];

export const EDITABLE_RESERVATION_STATUSES: readonly ReservationStatus[] = ['BOOKED', 'SEATED'];
export const ACTIVE_RESERVATION_STATUSES: readonly ReservationStatus[] = ['BOOKED', 'SEATED'];

export const guestSchema = z
  .object({
    id: z.string().uuid(),
    guestName: z.string(),
    phoneNumber: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const reservationTableSchema = restaurantTableSchema.pick({
  id: true,
  tableNumber: true,
  capacity: true,
  currentStatus: true,
});

export const reservationSchema = z
  .object({
    id: z.string().uuid(),
    guestId: z.string().uuid(),
    tableId: z.string().uuid().nullable(),
    table: reservationTableSchema.nullable(),
    createdByUserId: z.string().uuid(),
    reservationAt: z.string().datetime(),
    partySize: z.number().int(),
    status: reservationStatusSchema,
    notes: z.string().nullable(),
    cancellationReason: z.string().nullable(),
    guest: guestSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const reservationListQuerySchema = paginationQuerySchema.extend({
  status: reservationStatusSchema.optional(),
});

export const reservationListResponseSchema = paginatedResponseSchema(reservationSchema);

export const cancelReservationRequestSchema = z
  .object({
    reason: z.string().trim().max(255, 'Reason must be 255 characters or fewer').optional(),
  })
  .strict();

export const assignReservationTableRequestSchema = z
  .object({
    tableId: z.string().uuid('Table id must be a valid UUID').nullable(),
  })
  .strict()
  .describe('Assign or reassign a table; null clears the assignment. BOOKED and SEATED only.');

export const assignReservationTableResponseSchema = reservationSchema;

export const guestLookupQuerySchema = z
  .object({
    phoneNumber: guestPhoneSchema,
  })
  .strict();

export const guestLookupResponseSchema = guestSchema.nullable();

export const createWalkInRequestSchema = z
  .object({
    guestName: guestNameSchema,
    phoneNumber: guestPhoneSchema,
    partySize: partySizeSchema,
    tableId: z.string().uuid('Table id must be a valid UUID'),
    notes: reservationNotesSchema,
  })
  .strict();

export const createReservationRequestSchema = z
  .object({
    guestName: guestNameSchema,
    phoneNumber: guestPhoneSchema,
    partySize: partySizeSchema,
    reservationAt: z
      .string({ required_error: 'Reservation date and time is required' })
      .datetime({
        offset: true,
        message: 'Reservation date and time must be a valid ISO-8601 datetime',
      })
      .refine((value) => new Date(value).getTime() > Date.now(), {
        message: 'Reservation date and time must be in the future',
      }),
    tableId: z.string().uuid('Table id must be a valid UUID').optional(),
    notes: reservationNotesSchema,
  })
  .strict();

export const updateReservationGuestSchema = z
  .object({
    guestName: guestNameSchema.optional(),
    phoneNumber: guestPhoneSchema.optional(),
  })
  .strict();

export const updateReservationRequestSchema = createReservationRequestSchema
  .pick({ reservationAt: true, partySize: true, notes: true })
  .partial()
  .extend({
    partySize: updatePartySizeSchema.optional(),
    guest: updateReservationGuestSchema.optional(),
  })
  .strict()
  .describe(
    'Partial update of a BOOKED or SEATED reservation. Supplied times must be in the future; ' +
      'reservationAt cannot be changed after seating. ' +
      'Guest changes update the shared guest profile for all its reservations.',
  );

export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
export type Guest = z.infer<typeof guestSchema>;
export type Reservation = z.infer<typeof reservationSchema>;
export type AssignReservationTableRequest = z.infer<typeof assignReservationTableRequestSchema>;
export type AssignReservationTableResponse = z.infer<typeof assignReservationTableResponseSchema>;
export type ReservationListQuery = z.infer<typeof reservationListQuerySchema>;
export type ReservationListResponse = z.infer<typeof reservationListResponseSchema>;
export type GuestLookupQuery = z.infer<typeof guestLookupQuerySchema>;
export type GuestLookupResponse = z.infer<typeof guestLookupResponseSchema>;
export type CreateWalkInRequest = z.infer<typeof createWalkInRequestSchema>;
export type CreateReservationRequest = z.infer<typeof createReservationRequestSchema>;
export type CancelReservationRequest = z.infer<typeof cancelReservationRequestSchema>;
export type UpdateReservationGuest = z.infer<typeof updateReservationGuestSchema>;
export type UpdateReservationRequest = z.infer<typeof updateReservationRequestSchema>;
