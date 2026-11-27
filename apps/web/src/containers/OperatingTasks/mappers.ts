import { createOperatingTaskSchema, type OperatingTask } from '@rms/api-contract';
import { z } from 'zod';

export const TASK_KIND_LABELS = {
  OPENING: 'Opening',
  CLOSING: 'Closing',
  CLEANING: 'Cleaning',
  TEMPERATURE: 'Temperature',
  EXPIRY: 'Expiry',
} as const;
export const TASK_STATUS_LABELS = {
  PENDING: 'Pending',
  COMPLETED: 'Completed',
  EXCEPTION: 'Exception',
  CANCELLED: 'Cancelled',
} as const;
export const taskEditorSchema = createOperatingTaskSchema.omit({ dueAt: true }).extend({
  dueAtLocal: z
    .string()
    .min(1, 'Choose a due time')
    .refine((value) => Number.isFinite(new Date(value).getTime()), 'Choose a valid due time'),
});
export type TaskEditorValues = z.infer<typeof taskEditorSchema>;
export function getTaskEditorDefaults(task?: OperatingTask): TaskEditorValues {
  const due = task ? new Date(task.dueAt) : null;
  return {
    title: task?.title ?? '',
    kind: task?.kind ?? 'OPENING',
    instructions: task?.instructions ?? '',
    assignedToUserId: task?.assignedTo.id ?? '',
    dueAtLocal: due
      ? new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
      : '',
  };
}
export function toTaskInput(values: TaskEditorValues): z.infer<typeof createOperatingTaskSchema> {
  const { dueAtLocal, ...input } = values;
  return { ...input, dueAt: new Date(dueAtLocal).toISOString() };
}
