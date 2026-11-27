import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './common';

const personSchema = z.object({ id: z.string().uuid(), name: z.string() }).strict();
export const attendanceProvenanceSchema = z
  .object({
    deviceLabel: z.string().trim().min(1, 'Identify the device or workstation').max(120),
    locationLabel: z.string().trim().min(1, 'Enter the work location').max(255),
    note: z.string().trim().max(1000),
  })
  .strict();
const liveActionFields = {
  sessionId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
};
export const attendanceActionSchema = z.discriminatedUnion('action', [
  attendanceProvenanceSchema.extend({ action: z.literal('CLOCK_IN') }),
  attendanceProvenanceSchema.extend({ action: z.literal('CLOCK_OUT'), ...liveActionFields }),
  attendanceProvenanceSchema.extend({ action: z.literal('BREAK_START'), ...liveActionFields }),
  attendanceProvenanceSchema.extend({ action: z.literal('BREAK_END'), ...liveActionFields }),
]);
const closedTimelineSchema = z
  .object({
    clockInAt: z.string().datetime({ offset: true }),
    clockOutAt: z.string().datetime({ offset: true }),
    breaks: z
      .array(
        z
          .object({
            startedAt: z.string().datetime({ offset: true }),
            endedAt: z.string().datetime({ offset: true }),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export const attendanceTimelineSchema = closedTimelineSchema.superRefine((timeline, context) => {
  const first = Date.parse(timeline.clockInAt),
    last = Date.parse(timeline.clockOutAt);
  if (last <= first)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['clockOutAt'],
      message: 'Clock-out must follow clock-in',
    });
  const breaks = timeline.breaks
    .map((entry, index) => ({
      first: Date.parse(entry.startedAt),
      last: Date.parse(entry.endedAt),
      index,
    }))
    .sort((a, b) => a.first - b.first);
  let previousEnd = first;
  for (const entry of breaks) {
    if (
      entry.last <= entry.first ||
      entry.first < first ||
      entry.last > last ||
      entry.first < previousEnd
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['breaks', entry.index],
        message: 'Breaks must be inside the session, ordered and non-overlapping',
      });
    previousEnd = Math.max(previousEnd, entry.last);
  }
});
export const requestAttendanceCorrectionSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(2000),
    timeline: attendanceTimelineSchema,
  })
  .strict();
export const decideAttendanceCorrectionSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    decision: z.enum(['APPROVED', 'REJECTED']),
    reviewNote: z.string().trim().min(1, 'Record the review decision').max(2000),
  })
  .strict();
export const attendanceCorrectionSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    user: personSchema,
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
    version: z.number().int().nonnegative(),
    baseSessionVersion: z.number().int().nonnegative(),
    requestedBy: personSchema,
    reason: z.string(),
    timeline: attendanceTimelineSchema,
    originalTimeline: closedTimelineSchema,
    reviewedBy: personSchema.nullable(),
    reviewNote: z.string().nullable(),
    reviewedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export const attendanceSessionSchema = z
  .object({
    id: z.string().uuid(),
    user: personSchema,
    version: z.number().int().nonnegative(),
    clockInAt: z.string().datetime(),
    clockOutAt: z.string().datetime().nullable(),
    breaks: z.array(
      z
        .object({
          id: z.string().uuid(),
          startedAt: z.string().datetime(),
          endedAt: z.string().datetime().nullable(),
        })
        .strict(),
    ),
    effectiveTimeline: attendanceTimelineSchema.nullable(),
    appliedCorrectionId: z.string().uuid().nullable(),
    grossSeconds: z.number().nonnegative(),
    recordedBreakSeconds: z.number().nonnegative(),
    recordedWorkSeconds: z.number().nonnegative(),
    asOf: z.string().datetime(),
  })
  .strict();
export const currentAttendanceSchema = z
  .object({ data: attendanceSessionSchema.nullable(), asOf: z.string().datetime() })
  .strict();
export const attendanceQuerySchema = paginationQuerySchema
  .extend({ userId: z.string().uuid().optional(), openOnly: z.enum(['true', 'false']).optional() })
  .strict();
export const attendanceListSchema = paginatedResponseSchema(attendanceSessionSchema);
export const attendanceCorrectionQuerySchema = paginationQuerySchema
  .extend({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() })
  .strict();
export const attendanceCorrectionListSchema = paginatedResponseSchema(attendanceCorrectionSchema);
export const attendanceHistoryQuerySchema = paginationQuerySchema;
export const attendanceEventSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum([
      'CLOCK_IN',
      'CLOCK_OUT',
      'BREAK_START',
      'BREAK_END',
      'CORRECTION_REQUESTED',
      'CORRECTION_APPROVED',
      'CORRECTION_REJECTED',
    ]),
    recordedBy: personSchema,
    deviceLabel: z.string().nullable(),
    locationLabel: z.string().nullable(),
    userAgent: z.string().nullable(),
    note: z.string(),
    correctionId: z.string().uuid().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export const attendanceHistorySchema = paginatedResponseSchema(attendanceEventSchema);
export type AttendanceAction = z.infer<typeof attendanceActionSchema>;
export type AttendanceTimeline = z.infer<typeof attendanceTimelineSchema>;
export type AttendanceSession = z.infer<typeof attendanceSessionSchema>;
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;
export type AttendanceList = z.infer<typeof attendanceListSchema>;
export type CurrentAttendance = z.infer<typeof currentAttendanceSchema>;
export type RequestAttendanceCorrection = z.infer<typeof requestAttendanceCorrectionSchema>;
export type DecideAttendanceCorrection = z.infer<typeof decideAttendanceCorrectionSchema>;
export type AttendanceCorrection = z.infer<typeof attendanceCorrectionSchema>;
export type AttendanceCorrectionQuery = z.infer<typeof attendanceCorrectionQuerySchema>;
export type AttendanceCorrectionList = z.infer<typeof attendanceCorrectionListSchema>;
export type AttendanceHistoryQuery = z.infer<typeof attendanceHistoryQuerySchema>;
export type AttendanceHistory = z.infer<typeof attendanceHistorySchema>;

export type AttendanceProvenance = z.infer<typeof attendanceProvenanceSchema>;
