import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './common';

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

const partySizeSchema = z.coerce
  .number({ invalid_type_error: 'Party size is required' })
  .int('Party size must be a whole number')
  .min(1, 'Party size must be at least 1')
  .max(MAX_PARTY_SIZE, `Party size must be ${MAX_PARTY_SIZE} or fewer`);

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

export const guestSchema = z
  .object({
    id: z.string().uuid(),
    guestName: z.string(),
    phoneNumber: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const reservationSchema = z
  .object({
    id: z.string().uuid(),
    guestId: z.string().uuid(),
    tableId: z.string().uuid().nullable(),
    createdByUserId: z.string().uuid(),
    reservationAt: z.string().datetime(),
    partySize: z.number().int(),
    status: reservationStatusSchema,
    notes: z.string().nullable(),
    guest: guestSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const reservationListQuerySchema = paginationQuerySchema.extend({
  status: reservationStatusSchema.optional(),
});

export const reservationListResponseSchema = paginatedResponseSchema(reservationSchema);

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
    notes: reservationNotesSchema,
  })
  .strict();

export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
export type Guest = z.infer<typeof guestSchema>;
export type Reservation = z.infer<typeof reservationSchema>;
export type ReservationListQuery = z.infer<typeof reservationListQuerySchema>;
export type ReservationListResponse = z.infer<typeof reservationListResponseSchema>;
export type GuestLookupQuery = z.infer<typeof guestLookupQuerySchema>;
export type GuestLookupResponse = z.infer<typeof guestLookupResponseSchema>;
export type CreateWalkInRequest = z.infer<typeof createWalkInRequestSchema>;
