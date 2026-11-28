'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { OperatingTask } from '@rms/api-contract';
import { type ReactElement, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import useShowApiError from '@/hooks/api/useShowApiError';
import {
  useOperatingTaskAssignees,
  useSaveOperatingTask,
} from '@/services/api/requests/operating-tasks';

import {
  getTaskEditorDefaults,
  TASK_KIND_LABELS,
  taskEditorSchema,
  type TaskEditorValues,
  toTaskInput,
} from './mappers';

export default function TaskEditorDialog({
  task,
  onClose,
}: {
  task?: OperatingTask;
  onClose: () => void;
}): ReactElement {
  const form = useForm<TaskEditorValues>({
    resolver: zodResolver(taskEditorSchema),
    defaultValues: getTaskEditorDefaults(task),
  });
  const assignees = useOperatingTaskAssignees(true);
  const assignedTo = useWatch({ control: form.control, name: 'assignedToUserId' });
  const { mutateAsync: saveTask, isPending, isSuccess } = useSaveOperatingTask();
  const showApiError = useShowApiError('Unable to load task assignees.');
  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);
  useEffect(() => {
    if (assignees.error) showApiError(assignees.error);
  }, [assignees.error, assignees.errorUpdatedAt, showApiError]);
  const submit = form.handleSubmit(async (values) => {
    try {
      const input = toTaskInput(values);
      await saveTask(
        task
          ? { action: 'update', id: task.id, input: { ...input, expectedVersion: task.version } }
          : { action: 'create', input },
      );
    } catch {
      // The request hook owns API errors; preserve the operator's draft.
    }
  });
  const { errors } = form.formState;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit operating check' : 'Assign operating check'}</DialogTitle>
          <DialogDescription>
            Assign a check and a due time. Changes remain in its history. Reminders are not enabled.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-3">
          <fieldset disabled={isPending} className="space-y-3">
            <label className="block text-sm">
              Check title
              <Input {...form.register('title')} />
            </label>
            <FieldError>{errors.title?.message}</FieldError>
            <label className="block text-sm">
              Check type
              <select className="w-full rounded border p-2" {...form.register('kind')}>
                {Object.entries(TASK_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Instructions
              <Textarea maxLength={2000} {...form.register('instructions')} />
            </label>
            <FieldError>{errors.instructions?.message}</FieldError>
            <label className="block text-sm">
              Assigned staff
              <select
                className="w-full rounded border p-2"
                {...form.register('assignedToUserId')}
                value={assignedTo}
              >
                <option value="">Choose staff</option>
                {assignees.data?.data.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <FieldError>{errors.assignedToUserId?.message}</FieldError>
            {assignees.isSuccess && assignees.data.data.length === 0 && (
              <p role="alert">
                Staff need task read and complete permissions before they can be assigned.
              </p>
            )}
            <label className="block text-sm">
              Due time (your local time)
              <Input type="datetime-local" step={1} {...form.register('dueAtLocal')} />
            </label>
            <FieldError>{errors.dueAtLocal?.message}</FieldError>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={assignees.isPending || assignees.isError}>
                {isPending ? 'Saving…' : 'Save check'}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
