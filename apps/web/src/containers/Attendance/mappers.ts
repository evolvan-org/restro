import {
  type AttendanceSession,
  type AttendanceTimeline,
  attendanceTimelineSchema,
  requestAttendanceCorrectionSchema,
} from '@rms/api-contract';
import { z } from 'zod';

const localTimestamp = z
  .string()
  .min(1, 'Enter a time')
  .refine((value) => Number.isFinite(new Date(value).getTime()), 'Enter a valid local time');
export const attendanceCorrectionFormSchema = requestAttendanceCorrectionSchema
  .omit({ timeline: true })
  .extend({
    clockInLocal: localTimestamp,
    clockOutLocal: localTimestamp,
    breaks: z
      .array(z.object({ startedLocal: localTimestamp, endedLocal: localTimestamp }))
      .max(100),
  });
export type AttendanceCorrectionForm = z.infer<typeof attendanceCorrectionFormSchema>;
export function localAttendanceTime(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 23);
}
export function getAttendanceCorrectionDefaults(
  session: AttendanceSession,
): AttendanceCorrectionForm {
  const timeline = session.effectiveTimeline ?? {
    clockInAt: session.clockInAt,
    clockOutAt: session.clockOutAt ?? session.asOf,
    breaks: session.breaks.map((entry) => ({
      startedAt: entry.startedAt,
      endedAt: entry.endedAt ?? session.asOf,
    })),
  };
  return {
    expectedVersion: session.version,
    reason: '',
    clockInLocal: localAttendanceTime(timeline.clockInAt),
    clockOutLocal: localAttendanceTime(timeline.clockOutAt),
    breaks: timeline.breaks.map((entry) => ({
      startedLocal: localAttendanceTime(entry.startedAt),
      endedLocal: localAttendanceTime(entry.endedAt),
    })),
  };
}
export function toAttendanceTimeline(values: AttendanceCorrectionForm): AttendanceTimeline {
  return attendanceTimelineSchema.parse({
    clockInAt: new Date(values.clockInLocal).toISOString(),
    clockOutAt: new Date(values.clockOutLocal).toISOString(),
    breaks: values.breaks.map((entry) => ({
      startedAt: new Date(entry.startedLocal).toISOString(),
      endedAt: new Date(entry.endedLocal).toISOString(),
    })),
  });
}
export function formatAttendanceDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ${Math.floor(seconds % 60)}s`;
}
export const ATTENDANCE_ACTION_LABELS = {
  CLOCK_IN: 'Clocked in',
  CLOCK_OUT: 'Clocked out',
  BREAK_START: 'Break started',
  BREAK_END: 'Break ended',
  CORRECTION_REQUESTED: 'Correction requested',
  CORRECTION_APPROVED: 'Correction approved',
  CORRECTION_REJECTED: 'Correction rejected',
};
