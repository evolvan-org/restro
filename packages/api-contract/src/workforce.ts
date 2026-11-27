import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './common';

const personSchema = z.object({ id: z.string().uuid(), name: z.string() }).strict();
const instant = z.string().datetime({ offset: true });
const version = z.number().int().nonnegative();
const reason = z.string().trim().min(1, 'Record the reason').max(2000);
const intervalFields = { startsAt: instant, endsAt: instant };
function validInterval(value: { startsAt: string; endsAt: string }): boolean {
  return Date.parse(value.endsAt) > Date.parse(value.startsAt);
}
const shiftFieldsSchema = z
  .object({ userId: z.string().uuid(), ...intervalFields, note: z.string().trim().max(1000) })
  .strict();
export const createStaffShiftSchema = shiftFieldsSchema.refine(validInterval, {
  path: ['endsAt'],
  message: 'A shift must end after it starts',
});
export const updateStaffShiftSchema = shiftFieldsSchema
  .extend({ expectedVersion: version, reason })
  .refine(validInterval, { path: ['endsAt'], message: 'A shift must end after it starts' });
export const replaceStaffShiftSchema = z
  .object({ expectedVersion: version, replacementUserId: z.string().uuid(), reason })
  .strict();
export const cancelWorkforceRecordSchema = z.object({ expectedVersion: version, reason }).strict();
export const availabilityKindSchema = z.enum(['AVAILABLE', 'UNAVAILABLE']);
const availabilityFieldsSchema = z
  .object({
    userId: z.string().uuid().optional(),
    ...intervalFields,
    kind: availabilityKindSchema,
    note: z.string().trim().max(1000),
  })
  .strict();
export const createStaffAvailabilitySchema = availabilityFieldsSchema.refine(validInterval, {
  path: ['endsAt'],
  message: 'Availability must end after it starts',
});
export const updateStaffAvailabilitySchema = availabilityFieldsSchema
  .omit({ userId: true })
  .extend({ expectedVersion: version, reason })
  .refine(validInterval, { path: ['endsAt'], message: 'Availability must end after it starts' });
export const staffLeaveKindSchema = z.enum(['ANNUAL', 'SICK', 'UNPAID', 'OTHER']);
const leaveFieldsSchema = z
  .object({
    userId: z.string().uuid().optional(),
    ...intervalFields,
    kind: staffLeaveKindSchema,
    reason,
  })
  .strict();
export const requestStaffLeaveSchema = leaveFieldsSchema.refine(validInterval, {
  path: ['endsAt'],
  message: 'Leave must end after it starts',
});
export const decideStaffLeaveSchema = z
  .object({
    expectedVersion: version,
    decision: z.enum(['APPROVED', 'REJECTED']),
    reviewNote: reason,
  })
  .strict();
export const staffShiftSnapshotSchema = z
  .object({
    id: z.string().uuid(),
    user: personSchema,
    startsAt: instant,
    endsAt: instant,
    note: z.string(),
    status: z.enum(['SCHEDULED', 'CANCELLED']),
    version,
    createdBy: personSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const shiftClashSchema = z
  .object({
    kind: z.enum(['SHIFT', 'UNAVAILABLE', 'LEAVE', 'INACTIVE_STAFF']),
    recordId: z.string().uuid(),
    summary: z.string(),
  })
  .strict();
export const staffShiftSchema = staffShiftSnapshotSchema.extend({
  clashes: z.array(shiftClashSchema),
});
export const staffAvailabilitySchema = z
  .object({
    id: z.string().uuid(),
    user: personSchema,
    ...intervalFields,
    kind: availabilityKindSchema,
    note: z.string(),
    isActive: z.boolean(),
    version,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const staffLeaveSchema = z
  .object({
    id: z.string().uuid(),
    user: personSchema,
    ...intervalFields,
    kind: staffLeaveKindSchema,
    reason: z.string(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']),
    version,
    requestedBy: personSchema,
    reviewedBy: personSchema.nullable(),
    reviewNote: z.string().nullable(),
    reviewedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const workforceQuerySchema = paginationQuerySchema
  .extend({
    userId: z.string().uuid().optional(),
    from: instant.optional(),
    to: instant.optional(),
  })
  .strict();
export const shiftQuerySchema = workforceQuerySchema.extend({
  status: z.enum(['SCHEDULED', 'CANCELLED']).optional(),
});
export const availabilityQuerySchema = workforceQuerySchema.extend({
  activeOnly: z.enum(['true', 'false']).optional(),
});
export const staffLeaveQuerySchema = workforceQuerySchema.extend({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
});
export const staffShiftListSchema = paginatedResponseSchema(staffShiftSchema).extend({
  updatedAt: z.string().datetime(),
});
export const staffAvailabilityListSchema = paginatedResponseSchema(staffAvailabilitySchema);
export const staffLeaveListSchema = paginatedResponseSchema(staffLeaveSchema).extend({
  actorUserId: z.string().uuid(),
});
export const workforceStaffSchema = z.object({ data: z.array(personSchema) }).strict();
export const workforceHistoryQuerySchema = paginationQuerySchema;
export const workforceSnapshotSchema = z.discriminatedUnion('entity', [
  z.object({ entity: z.literal('SHIFT'), data: staffShiftSnapshotSchema }).strict(),
  z.object({ entity: z.literal('AVAILABILITY'), data: staffAvailabilitySchema }).strict(),
  z.object({ entity: z.literal('LEAVE'), data: staffLeaveSchema }).strict(),
]);
export const workforceEventSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum([
      'CREATED',
      'UPDATED',
      'REASSIGNED',
      'CANCELLED',
      'ARCHIVED',
      'APPROVED',
      'REJECTED',
    ]),
    snapshot: workforceSnapshotSchema,
    reason: z.string().nullable(),
    recordedBy: personSchema,
    createdAt: z.string().datetime(),
  })
  .strict();
export const workforceHistorySchema = paginatedResponseSchema(workforceEventSchema);
export type CreateStaffShift = z.infer<typeof createStaffShiftSchema>;
export type UpdateStaffShift = z.infer<typeof updateStaffShiftSchema>;
export type ReplaceStaffShift = z.infer<typeof replaceStaffShiftSchema>;
export type CancelWorkforceRecord = z.infer<typeof cancelWorkforceRecordSchema>;
export type CreateStaffAvailability = z.infer<typeof createStaffAvailabilitySchema>;
export type UpdateStaffAvailability = z.infer<typeof updateStaffAvailabilitySchema>;
export type RequestStaffLeave = z.infer<typeof requestStaffLeaveSchema>;
export type DecideStaffLeave = z.infer<typeof decideStaffLeaveSchema>;
export type StaffShift = z.infer<typeof staffShiftSchema>;
export type StaffAvailability = z.infer<typeof staffAvailabilitySchema>;
export type StaffLeave = z.infer<typeof staffLeaveSchema>;
export type ShiftQuery = z.infer<typeof shiftQuerySchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type StaffLeaveQuery = z.infer<typeof staffLeaveQuerySchema>;
export type StaffShiftList = z.infer<typeof staffShiftListSchema>;
export type StaffAvailabilityList = z.infer<typeof staffAvailabilityListSchema>;
export type StaffLeaveList = z.infer<typeof staffLeaveListSchema>;
export type WorkforceStaff = z.infer<typeof workforceStaffSchema>;
export type WorkforceHistoryQuery = z.infer<typeof workforceHistoryQuerySchema>;
export type WorkforceHistory = z.infer<typeof workforceHistorySchema>;
export type WorkforceSnapshot = z.infer<typeof workforceSnapshotSchema>;
export type ShiftClash = z.infer<typeof shiftClashSchema>;

export const workforceEntitySchema = z.enum(['SHIFT', 'AVAILABILITY', 'LEAVE']);
