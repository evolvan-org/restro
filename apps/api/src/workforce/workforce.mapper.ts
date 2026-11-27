import { type StaffAvailability, type StaffLeave, type WorkforceSnapshot } from '@rms/api-contract';

import type { AvailabilityRecord, LeaveRecord, ShiftRecord } from './workforce.repository';

export function toShiftSnapshot(
  record: ShiftRecord,
): Extract<WorkforceSnapshot, { entity: 'SHIFT' }>['data'] {
  return {
    id: record.id,
    user: { id: record.user.id, name: record.user.name },
    createdBy: record.createdBy,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    note: record.note,
    status: record.status,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
export function toAvailability(record: AvailabilityRecord): StaffAvailability {
  return {
    id: record.id,
    user: record.user,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    kind: record.kind,
    note: record.note,
    isActive: record.isActive,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
export function toStaffLeave(record: LeaveRecord): StaffLeave {
  return {
    id: record.id,
    user: record.user,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    kind: record.kind,
    reason: record.reason,
    status: record.status,
    version: record.version,
    requestedBy: record.requestedBy,
    reviewedBy: record.reviewedBy,
    reviewNote: record.reviewNote,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
