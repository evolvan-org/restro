import {
  createStaffAvailabilitySchema,
  createStaffShiftSchema,
  requestStaffLeaveSchema,
  type StaffAvailability,
  type StaffShift,
} from '@rms/api-contract';
import { z } from 'zod';

const localInstant = z
  .string()
  .min(1, 'Enter a time')
  .refine(
    (value) => Number.isFinite(new Date(value).getTime()),
    'Enter a valid local date and time',
  );
const optionalUser = z.union([z.string().uuid(), z.literal('')]);
const localFields = { startsLocal: localInstant, endsLocal: localInstant };
function intervalIsValid(value: { startsLocal: string; endsLocal: string }): boolean {
  return Date.parse(value.endsLocal) > Date.parse(value.startsLocal);
}
const shiftFormBase = createStaffShiftSchema
  .innerType()
  .omit({ startsAt: true, endsAt: true })
  .extend({ ...localFields, reason: z.string().trim().max(2000) });
export type ShiftFormValues = z.infer<typeof shiftFormBase>;
export function shiftFormSchema(editing: boolean): z.ZodType<ShiftFormValues> {
  return shiftFormBase.superRefine((values, context) => {
    if (!intervalIsValid(values))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsLocal'],
        message: 'The shift must end after it starts',
      });
    if (editing && !values.reason)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Explain the change',
      });
  });
}
const availabilityFormBase = createStaffAvailabilitySchema
  .innerType()
  .omit({ startsAt: true, endsAt: true, userId: true })
  .extend({ ...localFields, userId: optionalUser, reason: z.string().trim().max(2000) });
export type AvailabilityFormValues = z.infer<typeof availabilityFormBase>;
export function availabilityFormSchema(editing: boolean): z.ZodType<AvailabilityFormValues> {
  return availabilityFormBase.superRefine((values, context) => {
    if (!intervalIsValid(values))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsLocal'],
        message: 'The window must end after it starts',
      });
    if (editing && !values.reason)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Explain the change',
      });
  });
}
export const leaveFormSchema = requestStaffLeaveSchema
  .innerType()
  .omit({ startsAt: true, endsAt: true, userId: true })
  .extend({ ...localFields, userId: optionalUser })
  .refine(intervalIsValid, { path: ['endsLocal'], message: 'Leave must end after it starts' });
export type LeaveFormValues = z.infer<typeof leaveFormSchema>;
export function localWorkforceTime(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 23);
}
export function shiftDefaults(record?: StaffShift): ShiftFormValues {
  return {
    userId: record?.user.id ?? '',
    startsLocal: record ? localWorkforceTime(record.startsAt) : '',
    endsLocal: record ? localWorkforceTime(record.endsAt) : '',
    note: record?.note ?? '',
    reason: '',
  };
}
export function availabilityDefaults(record?: StaffAvailability): AvailabilityFormValues {
  return {
    userId: record?.user.id ?? '',
    startsLocal: record ? localWorkforceTime(record.startsAt) : '',
    endsLocal: record ? localWorkforceTime(record.endsAt) : '',
    note: record?.note ?? '',
    kind: record?.kind ?? 'UNAVAILABLE',
    reason: '',
  };
}
export function shiftInput(values: ShiftFormValues): z.infer<typeof createStaffShiftSchema> {
  return {
    userId: values.userId,
    startsAt: new Date(values.startsLocal).toISOString(),
    endsAt: new Date(values.endsLocal).toISOString(),
    note: values.note,
  };
}
export function availabilityInput(
  values: AvailabilityFormValues,
): z.infer<typeof createStaffAvailabilitySchema> {
  return {
    userId: values.userId || undefined,
    startsAt: new Date(values.startsLocal).toISOString(),
    endsAt: new Date(values.endsLocal).toISOString(),
    kind: values.kind,
    note: values.note,
  };
}
export function leaveInput(values: LeaveFormValues): z.infer<typeof requestStaffLeaveSchema> {
  return {
    userId: values.userId || undefined,
    startsAt: new Date(values.startsLocal).toISOString(),
    endsAt: new Date(values.endsLocal).toISOString(),
    kind: values.kind,
    reason: values.reason,
  };
}
export const LEAVE_KIND_LABELS = {
  ANNUAL: 'Annual leave',
  SICK: 'Sick leave',
  UNPAID: 'Unpaid leave',
  OTHER: 'Other leave',
} as const;
export const AVAILABILITY_LABELS = {
  AVAILABLE: 'Available (preference)',
  UNAVAILABLE: 'Unavailable',
} as const;
export const WORKFORCE_ACTION_LABELS = {
  CREATED: 'Created',
  UPDATED: 'Updated',
  REASSIGNED: 'Replacement cover assigned',
  CANCELLED: 'Cancelled',
  ARCHIVED: 'Archived',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
} as const;
export const workforceRangeSchema = z
  .object({
    fromLocal: z
      .string()
      .refine((value) => !value || Number.isFinite(Date.parse(value)), 'Choose a valid start'),
    toLocal: z
      .string()
      .refine((value) => !value || Number.isFinite(Date.parse(value)), 'Choose a valid end'),
    userId: optionalUser,
  })
  .refine(
    (value) =>
      !value.fromLocal || !value.toLocal || Date.parse(value.toLocal) > Date.parse(value.fromLocal),
    { path: ['toLocal'], message: 'The range must end after it starts' },
  );
export type WorkforceRangeValues = z.infer<typeof workforceRangeSchema>;
export function workforceRange(values: WorkforceRangeValues): {
  from?: string;
  to?: string;
  userId?: string;
} {
  return {
    from: values.fromLocal ? new Date(values.fromLocal).toISOString() : undefined,
    to: values.toLocal ? new Date(values.toLocal).toISOString() : undefined,
    userId: values.userId || undefined,
  };
}
