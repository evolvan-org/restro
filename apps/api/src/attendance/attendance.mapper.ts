import {
  type AttendanceCorrection,
  attendanceCorrectionSchema,
  type AttendanceSession,
  attendanceTimelineSchema,
} from '@rms/api-contract';

import type { AttendanceRecord, CorrectionRecord } from './attendance.repository';

export function toAttendanceSession(record: AttendanceRecord, now = new Date()): AttendanceSession {
  const effective = record.appliedCorrection
    ? attendanceTimelineSchema.parse(record.appliedCorrection.timeline)
    : null;
  const first = effective ? Date.parse(effective.clockInAt) : record.clockInAt.getTime();
  const last = effective ? Date.parse(effective.clockOutAt) : (record.clockOutAt ?? now).getTime();
  const gross = Math.max(0, last - first) / 1000;
  const intervals = effective
    ? effective.breaks
    : record.breaks.map((entry) => ({
        startedAt: entry.startedAt.toISOString(),
        endedAt: (entry.endedAt ?? now).toISOString(),
      }));
  const breakSeconds = intervals.reduce(
    (sum, entry) =>
      sum + Math.max(0, Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 1000,
    0,
  );
  return {
    id: record.id,
    user: record.user,
    version: record.version,
    clockInAt: record.clockInAt.toISOString(),
    clockOutAt: record.clockOutAt?.toISOString() ?? null,
    breaks: record.breaks.map((entry) => ({
      id: entry.id,
      startedAt: entry.startedAt.toISOString(),
      endedAt: entry.endedAt?.toISOString() ?? null,
    })),
    effectiveTimeline: effective,
    appliedCorrectionId: record.appliedCorrectionId,
    grossSeconds: gross,
    recordedBreakSeconds: breakSeconds,
    recordedWorkSeconds: Math.max(0, gross - breakSeconds),
    asOf: now.toISOString(),
  };
}
export function toAttendanceCorrection(record: CorrectionRecord): AttendanceCorrection {
  return attendanceCorrectionSchema.parse({
    id: record.id,
    sessionId: record.sessionId,
    user: record.user,
    status: record.status,
    version: record.version,
    baseSessionVersion: record.baseSessionVersion,
    requestedBy: record.requestedBy,
    reason: record.reason,
    timeline: record.timeline,
    originalTimeline: record.originalTimeline,
    reviewedBy: record.reviewedBy,
    reviewNote: record.reviewNote,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  });
}
