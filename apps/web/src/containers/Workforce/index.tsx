'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ShiftQuery, StaffLeaveQuery } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { type ReactElement, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import useShowApiError from '@/hooks/api/useShowApiError';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import {
  useStaffAvailability,
  useStaffLeave,
  useStaffShifts,
  useWorkforceStaff,
} from '@/services/api/requests/workforce';

import ActionDialog from './ActionDialog';
import AvailabilityDialog from './AvailabilityDialog';
import HistoryDialog from './HistoryDialog';
import LeaveDialog from './LeaveDialog';
import { workforceRange, workforceRangeSchema, type WorkforceRangeValues } from './mappers';
import { AvailabilityPanel, LeavePanel, ShiftPanel } from './Panels';
import ShiftDialog from './ShiftDialog';
import type { WorkforceSelection } from './view-types';

type SelectionFilters = {
  view: 'shifts' | 'availability' | 'leave';
  page: number;
  shiftStatus: ShiftQuery['status'] | '';
  leaveStatus: StaffLeaveQuery['status'] | '';
  includeArchived: boolean;
  range: Pick<ShiftQuery, 'from' | 'to' | 'userId'>;
};
export default function Workforce(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.SCHEDULE_READ]);
  const { can } = usePermissions();
  const canManage = can(Permission.WORKFORCE_MANAGE),
    canSelf = can(Permission.SCHEDULE_SELF),
    canApprove = can(Permission.LEAVE_APPROVE);
  const controls = useForm<SelectionFilters>({
    defaultValues: {
      view: 'shifts',
      page: 1,
      shiftStatus: 'SCHEDULED',
      leaveStatus: 'PENDING',
      includeArchived: false,
      range: {},
    },
  });
  const rangeForm = useForm<WorkforceRangeValues>({
    resolver: zodResolver(workforceRangeSchema),
    defaultValues: { fromLocal: '', toLocal: '', userId: '' },
  });
  const view = useWatch({ control: controls.control, name: 'view' }),
    page = useWatch({ control: controls.control, name: 'page' }),
    range = useWatch({ control: controls.control, name: 'range' }),
    shiftStatus = useWatch({ control: controls.control, name: 'shiftStatus' }),
    leaveStatus = useWatch({ control: controls.control, name: 'leaveStatus' }),
    includeArchived = useWatch({ control: controls.control, name: 'includeArchived' });
  const selectedUser = useWatch({ control: rangeForm.control, name: 'userId' });
  // Identifies the form or record opened by an explicit operator interaction.
  const [selected, setSelected] = useState<WorkforceSelection | null>(null);
  const staff = useWorkforceStaff(allowed && canManage);
  const shifts = useStaffShifts(
    { ...range, page, pageSize: 20, status: shiftStatus || undefined },
    allowed && view === 'shifts',
  );
  const availability = useStaffAvailability(
    { ...range, page, pageSize: 20, activeOnly: includeArchived ? 'false' : 'true' },
    allowed && view === 'availability',
  );
  const leave = useStaffLeave(
    { ...range, page, pageSize: 20, status: leaveStatus || undefined },
    allowed && view === 'leave',
  );
  const showApiError = useShowApiError('Unable to load the staff schedule.');
  useEffect(() => {
    if (staff.error) showApiError(staff.error);
  }, [staff.error, staff.errorUpdatedAt, showApiError]);
  useEffect(() => {
    if (shifts.error) showApiError(shifts.error);
  }, [shifts.error, shifts.errorUpdatedAt, showApiError]);
  useEffect(() => {
    if (availability.error) showApiError(availability.error);
  }, [availability.error, availability.errorUpdatedAt, showApiError]);
  useEffect(() => {
    if (leave.error) showApiError(leave.error);
  }, [leave.error, leave.errorUpdatedAt, showApiError]);
  const apply = rangeForm.handleSubmit((values) => {
    controls.setValue('range', workforceRange(values));
    controls.setValue('page', 1);
  });
  if (!allowed) return null;
  const current = view === 'shifts' ? shifts : view === 'availability' ? availability : leave;
  const meta = current.data?.meta;
  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Staff schedule</h1>
          <p className="text-muted-foreground">
            {canManage
              ? 'Manage assignments, availability and staff leave.'
              : 'Review your assignments, availability and leave.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={current.isFetching}
            onClick={() => {
              void current.refetch();
            }}
          >
            Refresh view
          </Button>
          {canManage && (
            <Button type="button" onClick={() => setSelected({ kind: 'shift' })}>
              Assign shift
            </Button>
          )}
          {(canManage || canSelf) && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelected({ kind: 'availability' })}
              >
                Record availability
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelected({ kind: 'leave' })}
              >
                Request leave
              </Button>
            </>
          )}
        </div>
      </header>
      <p className="text-sm text-muted-foreground">
        Planned shifts are separate from recorded attendance. Unavailable windows and approved leave
        block new conflicting assignments; later absence records flag existing shifts for cover.
        Available windows are preferences. Refresh to see changes made elsewhere.
      </p>
      <form
        aria-label="Schedule view filters"
        className="flex flex-wrap gap-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="text-sm">
          View
          <select
            className="ml-2 rounded border p-2"
            {...controls.register('view', { onChange: () => controls.setValue('page', 1) })}
          >
            <option value="shifts">Shifts</option>
            <option value="availability">Availability</option>
            <option value="leave">Leave requests</option>
          </select>
        </label>
        {view === 'shifts' && (
          <label className="text-sm">
            Shift status
            <select
              className="ml-2 rounded border p-2"
              {...controls.register('shiftStatus', {
                onChange: () => controls.setValue('page', 1),
              })}
            >
              <option value="">All shifts</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
        )}
        {view === 'availability' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...controls.register('includeArchived', {
                onChange: () => controls.setValue('page', 1),
              })}
            />
            Include archived windows
          </label>
        )}
        {view === 'leave' && (
          <label className="text-sm">
            Leave status
            <select
              className="ml-2 rounded border p-2"
              {...controls.register('leaveStatus', {
                onChange: () => controls.setValue('page', 1),
              })}
            >
              <option value="">All leave records</option>
              <option value="PENDING">Awaiting review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
        )}
      </form>
      <form
        onSubmit={apply}
        noValidate
        aria-label="Schedule date and staff filters"
        className="grid items-end gap-3 rounded border p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div>
          <label className="block text-sm">
            From (local time)
            <Input type="datetime-local" step="0.001" {...rangeForm.register('fromLocal')} />
          </label>
          <FieldError>{rangeForm.formState.errors.fromLocal?.message}</FieldError>
        </div>
        <div>
          <label className="block text-sm">
            To (local time, excluded)
            <Input type="datetime-local" step="0.001" {...rangeForm.register('toLocal')} />
          </label>
          <FieldError>{rangeForm.formState.errors.toLocal?.message}</FieldError>
        </div>
        {canManage && (
          <div>
            <label className="block text-sm">
              Staff filter
              <select
                className="w-full rounded border p-2"
                {...rangeForm.register('userId')}
                value={selectedUser}
              >
                <option value="">All staff</option>
                {staff.data?.data.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <FieldError>{rangeForm.formState.errors.userId?.message}</FieldError>
          </div>
        )}
        <Button type="submit">Apply date and staff filters</Button>
      </form>
      {view === 'shifts' && shifts.data && (
        <p className="text-sm text-muted-foreground">
          Clashes checked {new Date(shifts.data.updatedAt).toLocaleString()}
        </p>
      )}
      {current.isPending && <p role="status">Loading schedule records…</p>}
      {current.isError && <p role="alert">Unable to load records. Use Refresh view to retry.</p>}
      {current.isSuccess && current.data.data.length === 0 && (
        <p>No records match these filters.</p>
      )}
      {view === 'shifts' && (
        <ShiftPanel items={shifts.data?.data ?? []} canManage={canManage} onSelect={setSelected} />
      )}
      {view === 'availability' && (
        <AvailabilityPanel
          items={availability.data?.data ?? []}
          canEdit={canManage || canSelf}
          onSelect={setSelected}
        />
      )}
      {view === 'leave' && (
        <LeavePanel
          items={leave.data?.data ?? []}
          canManage={canManage}
          canSelf={canSelf}
          canApprove={canApprove}
          actorUserId={leave.data?.actorUserId}
          onSelect={setSelected}
        />
      )}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1 || current.isFetching}
            onClick={() => controls.setValue('page', page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {meta.totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page >= meta.totalPages || current.isFetching}
            onClick={() => controls.setValue('page', page + 1)}
          >
            Next
          </Button>
        </div>
      )}
      {selected?.kind === 'shift' && (
        <ShiftDialog record={selected.record} onClose={() => setSelected(null)} />
      )}
      {selected?.kind === 'availability' && (
        <AvailabilityDialog
          record={selected.record}
          canManage={canManage}
          onClose={() => setSelected(null)}
        />
      )}
      {selected?.kind === 'leave' && (
        <LeaveDialog canManage={canManage} onClose={() => setSelected(null)} />
      )}
      {selected?.kind === 'action' && (
        <ActionDialog selection={selected.selection} onClose={() => setSelected(null)} />
      )}
      {selected?.kind === 'history' && (
        <HistoryDialog
          entity={selected.entity}
          id={selected.id}
          name={selected.name}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
