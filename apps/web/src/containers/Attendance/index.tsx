'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type AttendanceAction,
  type AttendanceCorrection,
  type AttendanceProvenance,
  attendanceProvenanceSchema,
  type AttendanceSession,
} from '@rms/api-contract';
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
  useAttendanceAction,
  useAttendanceCorrections,
  useAttendanceList,
  useCurrentAttendance,
} from '@/services/api/requests/attendance';

import CorrectionDialog from './CorrectionDialog';
import HistoryDialog from './HistoryDialog';
import { formatAttendanceDuration } from './mappers';
import ReviewDialog from './ReviewDialog';

type Filters = {
  view: 'sessions' | 'corrections';
  page: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | '';
};
type Selected =
  | { mode: 'correction'; session: AttendanceSession }
  | { mode: 'review'; correction: AttendanceCorrection }
  | { mode: 'history'; id: string; name: string };
export default function Attendance(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.ATTENDANCE_READ]);
  const { can } = usePermissions();
  const canClock = can(Permission.ATTENDANCE_CLOCK),
    canManage = can(Permission.WORKFORCE_MANAGE),
    canApprove = can(Permission.ATTENDANCE_APPROVE);
  const provenance = useForm<AttendanceProvenance>({
    resolver: zodResolver(attendanceProvenanceSchema),
    defaultValues: { deviceLabel: '', locationLabel: '', note: '' },
  });
  const filters = useForm<Filters>({
    defaultValues: { view: 'sessions', page: 1, status: 'PENDING' },
  });
  const view = useWatch({ control: filters.control, name: 'view' }),
    page = useWatch({ control: filters.control, name: 'page' }),
    status = useWatch({ control: filters.control, name: 'status' });
  // Identifies the record and explicit dialog opened by the operator; server facts stay in Query.
  const [selected, setSelected] = useState<Selected | null>(null);
  const current = useCurrentAttendance(allowed),
    sessions = useAttendanceList({ page, pageSize: 20 }, allowed && view === 'sessions'),
    corrections = useAttendanceCorrections(
      { page, pageSize: 20, status: status || undefined },
      allowed && view === 'corrections',
    );
  const { mutateAsync: recordAttendance, isPending } = useAttendanceAction();
  const showApiError = useShowApiError('Unable to load attendance.');
  useEffect(() => {
    if (current.error) showApiError(current.error);
  }, [current.error, current.errorUpdatedAt, showApiError]);
  useEffect(() => {
    if (sessions.error) showApiError(sessions.error);
  }, [sessions.error, sessions.errorUpdatedAt, showApiError]);
  useEffect(() => {
    if (corrections.error) showApiError(corrections.error);
  }, [corrections.error, corrections.errorUpdatedAt, showApiError]);
  const open = current.data?.data;
  const openBreak = open?.breaks.some((entry) => entry.endedAt === null) ?? false;
  async function clock(action: AttendanceAction['action']): Promise<void> {
    await provenance.handleSubmit(async (values) => {
      let input: AttendanceAction;
      if (action === 'CLOCK_IN') input = { ...values, action };
      else {
        if (!open) return;
        input = { ...values, action, sessionId: open.id, expectedVersion: open.version };
      }
      try {
        await recordAttendance(input);
      } catch {
        // Shared mutation handling owns API errors; keep device/location fields and notes.
      }
    })();
  }
  if (!allowed) return null;
  const busy = isPending || current.isFetching;
  const meta = view === 'sessions' ? sessions.data?.meta : corrections.data?.meta;
  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="text-muted-foreground">
            {canManage
              ? 'Review staff attendance and correction requests.'
              : 'Record your time and review your attendance.'}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy || sessions.isFetching || corrections.isFetching}
          onClick={() => {
            void Promise.all([
              current.refetch(),
              view === 'sessions' ? sessions.refetch() : corrections.refetch(),
            ]);
          }}
        >
          Refresh attendance
        </Button>
      </header>
      <section aria-label="Your current attendance" className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Your current session</h2>
        {current.isPending && <p role="status">Loading current session…</p>}
        {current.isError && (
          <p role="alert">
            Unable to confirm your clock status. Refresh before recording attendance.
          </p>
        )}
        {current.isSuccess &&
          (open ? (
            <>
              <p>
                Clocked in {new Date(open.clockInAt).toLocaleString()}
                {openBreak ? ' · On break' : ' · Working'}
              </p>
              <p>
                Recorded work {formatAttendanceDuration(open.recordedWorkSeconds)} · Breaks{' '}
                {formatAttendanceDuration(open.recordedBreakSeconds)}
              </p>
            </>
          ) : (
            <p>You are clocked out.</p>
          ))}
        {current.data && (
          <p className="text-sm text-muted-foreground">
            Snapshot at {new Date(current.data.asOf).toLocaleString()}. Refresh to update elapsed
            time.
          </p>
        )}
        {canClock && (
          <form
            aria-label="Attendance device and location"
            onSubmit={(event) => event.preventDefault()}
            className="space-y-3"
          >
            <p className="text-sm text-muted-foreground">
              Identify the device and work location for this action. Labels are self-reported;
              browser details are retained. No location lookup runs.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="text-sm">
                <label htmlFor="attendance-device">Device or workstation</label>
                <Input
                  id="attendance-device"
                  aria-invalid={Boolean(provenance.formState.errors.deviceLabel)}
                  aria-describedby="attendance-device-error"
                  disabled={busy}
                  maxLength={120}
                  {...provenance.register('deviceLabel')}
                />
                <FieldError id="attendance-device-error">
                  {provenance.formState.errors.deviceLabel?.message}
                </FieldError>
              </div>
              <div className="text-sm">
                <label htmlFor="attendance-location">Work location</label>
                <Input
                  id="attendance-location"
                  aria-invalid={Boolean(provenance.formState.errors.locationLabel)}
                  aria-describedby="attendance-location-error"
                  disabled={busy}
                  maxLength={255}
                  {...provenance.register('locationLabel')}
                />
                <FieldError id="attendance-location-error">
                  {provenance.formState.errors.locationLabel?.message}
                </FieldError>
              </div>
            </div>
            <label className="block text-sm">
              Attendance note (optional)
              <Input disabled={busy} maxLength={1000} {...provenance.register('note')} />
            </label>
            <div className="flex flex-wrap gap-2">
              {open ? (
                <>
                  <Button
                    type="button"
                    disabled={busy || !current.isSuccess}
                    onClick={() => void clock(openBreak ? 'BREAK_END' : 'BREAK_START')}
                  >
                    {openBreak ? 'End break' : 'Start break'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || openBreak || !current.isSuccess}
                    onClick={() => void clock('CLOCK_OUT')}
                  >
                    Clock out
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  disabled={busy || !current.isSuccess}
                  onClick={() => void clock('CLOCK_IN')}
                >
                  Clock in
                </Button>
              )}
            </div>
          </form>
        )}
      </section>
      <p className="text-sm text-muted-foreground">
        Recorded work is gross session time minus all recorded breaks. It does not determine paid
        breaks, overtime or payable hours.
      </p>
      <form
        aria-label="Attendance view filters"
        className="flex flex-wrap gap-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="text-sm">
          View
          <select
            className="ml-2 rounded border p-2"
            {...filters.register('view', { onChange: () => filters.setValue('page', 1) })}
          >
            <option value="sessions">Attendance sessions</option>
            <option value="corrections">Correction requests</option>
          </select>
        </label>
        {view === 'corrections' && (
          <label className="text-sm">
            Correction status
            <select
              className="ml-2 rounded border p-2"
              {...filters.register('status', { onChange: () => filters.setValue('page', 1) })}
            >
              <option value="">All decisions</option>
              <option value="PENDING">Awaiting review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </label>
        )}
      </form>
      {view === 'sessions' ? (
        <section aria-label="Attendance sessions" className="space-y-3">
          {sessions.isPending && <p role="status">Loading sessions…</p>}
          {sessions.isError && <p role="alert">Unable to load sessions.</p>}
          {sessions.isSuccess && sessions.data.data.length === 0 && (
            <p>No attendance sessions recorded.</p>
          )}
          <ul className="grid gap-4 lg:grid-cols-2">
            {sessions.data?.data.map((session) => (
              <li key={session.id} className="space-y-2 rounded-lg border p-4">
                <h2 className="font-semibold">{session.user.name}</h2>
                <p>
                  In:{' '}
                  {new Date(
                    session.effectiveTimeline?.clockInAt ?? session.clockInAt,
                  ).toLocaleString()}
                </p>
                <p>
                  Out:{' '}
                  {session.clockOutAt
                    ? new Date(
                        session.effectiveTimeline?.clockOutAt ?? session.clockOutAt,
                      ).toLocaleString()
                    : 'Open session'}
                </p>
                {session.appliedCorrectionId && (
                  <p className="font-medium">
                    Approved correction applied · Original times remain in history
                  </p>
                )}
                <p>
                  Gross {formatAttendanceDuration(session.grossSeconds)} · Breaks{' '}
                  {formatAttendanceDuration(session.recordedBreakSeconds)} · Recorded work{' '}
                  {formatAttendanceDuration(session.recordedWorkSeconds)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setSelected({ mode: 'history', id: session.id, name: session.user.name })
                    }
                  >
                    Attendance history
                  </Button>
                  {Boolean(session.clockOutAt) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelected({ mode: 'correction', session })}
                    >
                      Request correction
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section aria-label="Attendance correction requests" className="space-y-3">
          {corrections.isPending && <p role="status">Loading correction requests…</p>}
          {corrections.isError && <p role="alert">Unable to load corrections.</p>}
          {corrections.isSuccess && corrections.data.data.length === 0 && (
            <p>No correction requests match this filter.</p>
          )}
          <ul className="grid gap-4 lg:grid-cols-2">
            {corrections.data?.data.map((correction) => (
              <li key={correction.id} className="space-y-2 rounded-lg border p-4">
                <h2 className="font-semibold">
                  {correction.user.name} · {correction.status}
                </h2>
                <p>
                  Requested by {correction.requestedBy.name} ·{' '}
                  {new Date(correction.createdAt).toLocaleString()}
                </p>
                <p>{correction.reason}</p>
                <p>
                  Proposed: {new Date(correction.timeline.clockInAt).toLocaleString()} –{' '}
                  {new Date(correction.timeline.clockOutAt).toLocaleString()}
                </p>
                {correction.reviewedBy && (
                  <p>
                    Reviewed by {correction.reviewedBy.name}: {correction.reviewNote}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {correction.status === 'PENDING' && canApprove && (
                    <Button
                      type="button"
                      onClick={() => setSelected({ mode: 'review', correction })}
                    >
                      Review correction
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setSelected({
                        mode: 'history',
                        id: correction.sessionId,
                        name: correction.user.name,
                      })
                    }
                  >
                    Attendance history
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1 || sessions.isFetching || corrections.isFetching}
            onClick={() => filters.setValue('page', page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {meta.totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page >= meta.totalPages || sessions.isFetching || corrections.isFetching}
            onClick={() => filters.setValue('page', page + 1)}
          >
            Next
          </Button>
        </div>
      )}
      {selected?.mode === 'correction' && (
        <CorrectionDialog session={selected.session} onClose={() => setSelected(null)} />
      )}
      {selected?.mode === 'review' && (
        <ReviewDialog correction={selected.correction} onClose={() => setSelected(null)} />
      )}
      {selected?.mode === 'history' && (
        <HistoryDialog id={selected.id} name={selected.name} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}
