import { type OperatingTask, operatingTaskResultSchema } from '@rms/api-contract';

import type { OperatingTaskRecord } from './operating-tasks.repository';

export function toOperatingTask(record: OperatingTaskRecord, now = new Date()): OperatingTask {
  return {
    id: record.id,
    title: record.title,
    kind: record.kind,
    instructions: record.instructions,
    assignedTo: record.assignedTo,
    createdBy: record.createdBy,
    dueAt: record.dueAt.toISOString(),
    status: record.status,
    version: record.version,
    completedAt: record.completedAt?.toISOString() ?? null,
    result: record.result == null ? null : operatingTaskResultSchema.parse(record.result),
    resolution: record.resolution,
    isOverdue: record.status === 'PENDING' && record.dueAt.getTime() < now.getTime(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
