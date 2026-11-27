import type { StaffAvailability, StaffLeave, StaffShift } from '@rms/api-contract';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';

import { AVAILABILITY_LABELS, LEAVE_KIND_LABELS } from './mappers';
import type { WorkforceSelection } from './view-types';

type Select = (selection: WorkforceSelection) => void;
export function ShiftPanel({
  items,
  canManage,
  onSelect,
}: {
  items: StaffShift[];
  canManage: boolean;
  onSelect: Select;
}): ReactElement {
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {items.map((record) => (
        <li key={record.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex justify-between gap-3">
            <h2 className="font-semibold">{record.user.name}</h2>
            <span>{record.status === 'SCHEDULED' ? 'Scheduled' : 'Cancelled'}</span>
          </div>
          <p>
            {new Date(record.startsAt).toLocaleString()} –{' '}
            {new Date(record.endsAt).toLocaleString()}
          </p>
          {record.note && <p>{record.note}</p>}
          {record.clashes.length > 0 && (
            <div className="rounded border border-destructive p-3">
              <h3 className="font-semibold text-destructive">Needs cover or schedule review</h3>
              <ul aria-label="Shift clashes" className="list-inside list-disc">
                {record.clashes.map((clash, index) => (
                  <li key={`${clash.kind}-${clash.recordId}-${index}`}>{clash.summary}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {canManage && record.status === 'SCHEDULED' && (
              <>
                <Button
                  type="button"
                  onClick={() =>
                    onSelect({ kind: 'action', selection: { action: 'replace-shift', record } })
                  }
                >
                  Arrange cover
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onSelect({ kind: 'shift', record })}
                >
                  Edit shift
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    onSelect({ kind: 'action', selection: { action: 'cancel-shift', record } })
                  }
                >
                  Cancel shift
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onSelect({
                  kind: 'history',
                  entity: 'SHIFT',
                  id: record.id,
                  name: record.user.name,
                })
              }
            >
              History
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
export function AvailabilityPanel({
  items,
  canEdit,
  onSelect,
}: {
  items: StaffAvailability[];
  canEdit: boolean;
  onSelect: Select;
}): ReactElement {
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {items.map((record) => (
        <li key={record.id} className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">
            {record.user.name} · {AVAILABILITY_LABELS[record.kind]}
          </h2>
          <p>
            {record.isActive ? 'Active' : 'Archived'} · {new Date(record.startsAt).toLocaleString()}{' '}
            – {new Date(record.endsAt).toLocaleString()}
          </p>
          {record.note && <p>{record.note}</p>}
          <div className="flex flex-wrap gap-2">
            {canEdit && record.isActive && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onSelect({ kind: 'availability', record })}
                >
                  Edit availability
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    onSelect({
                      kind: 'action',
                      selection: { action: 'archive-availability', record },
                    })
                  }
                >
                  Archive window
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onSelect({
                  kind: 'history',
                  entity: 'AVAILABILITY',
                  id: record.id,
                  name: record.user.name,
                })
              }
            >
              History
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
export function LeavePanel({
  items,
  canManage,
  canSelf,
  canApprove,
  actorUserId,
  onSelect,
}: {
  items: StaffLeave[];
  canManage: boolean;
  canSelf: boolean;
  canApprove: boolean;
  actorUserId?: string;
  onSelect: Select;
}): ReactElement {
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {items.map((record) => (
        <li key={record.id} className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">
            {record.user.name} · {LEAVE_KIND_LABELS[record.kind]}
          </h2>
          <p>
            {record.status} · {new Date(record.startsAt).toLocaleString()} –{' '}
            {new Date(record.endsAt).toLocaleString()}
          </p>
          <p>{record.reason}</p>
          <p className="text-sm text-muted-foreground">Requested by {record.requestedBy.name}</p>
          {record.reviewedBy && (
            <p>
              Review by {record.reviewedBy.name}: {record.reviewNote}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {canApprove && record.status === 'PENDING' && (
              <Button
                type="button"
                onClick={() =>
                  onSelect({ kind: 'action', selection: { action: 'decide-leave', record } })
                }
              >
                Review leave
              </Button>
            )}
            {((record.status === 'PENDING' &&
              (canManage || (canSelf && record.user.id === actorUserId))) ||
              (record.status === 'APPROVED' && canApprove)) && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  onSelect({ kind: 'action', selection: { action: 'cancel-leave', record } })
                }
              >
                Cancel leave
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onSelect({
                  kind: 'history',
                  entity: 'LEAVE',
                  id: record.id,
                  name: record.user.name,
                })
              }
            >
              History
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
