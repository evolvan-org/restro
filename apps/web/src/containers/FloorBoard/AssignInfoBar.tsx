'use client';

import { Eye, Info, TriangleAlert, X } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { shortNameOf } from '@/lib/qr';

import type { CaptainAssignment } from './useCaptainAssignment';

type AssignInfoBarProps = {
  assignment: CaptainAssignment;
  /** Name of the captain the board is focused on (eye button), if any. */
  focusCaptainName: string | null;
  /** Visible tables without a captain, for "Select all without captain". */
  visibleUnassignedIds: readonly string[];
};

/** Assign-mode messages under the section tabs: conflicts first, then the focus banner or hint. */
export default function AssignInfoBar({
  assignment,
  focusCaptainName,
  visibleUnassignedIds,
}: AssignInfoBarProps): ReactElement {
  const { conflicts } = assignment;

  if (conflicts) {
    const target = conflicts.target ? shortNameOf(conflicts.target.name) : null;
    const skipped = conflicts.tables
      .map(
        (table) =>
          `${table.tableNumber} was just ${
            table.captain ? `given to ${shortNameOf(table.captain.name)}` : 'left without a captain'
          }`,
      )
      .join('; ');
    const numbers = conflicts.tables.map((table) => table.tableNumber).join(', ');
    const one = conflicts.tables.length === 1;
    return (
      <div
        role="alert"
        className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p>
            <span className="font-semibold">
              {conflicts.appliedCount} of {conflicts.requestedCount} tables{' '}
              {target ? `assigned to ${target}` : 'cleared'}.
            </span>{' '}
            {skipped}, so {one ? 'it was' : 'they were'} left as is.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 bg-background"
            disabled={assignment.isPending}
            onClick={assignment.moveAnyway}
          >
            {target ? `Move ${numbers} to ${target} anyway` : `Clear ${numbers} anyway`}
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss"
          className="-mr-1 -mt-1 text-current"
          onClick={assignment.dismissConflicts}
        >
          <X />
        </Button>
      </div>
    );
  }

  if (focusCaptainName) {
    return (
      <div className="mb-4 flex items-center gap-2.5 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
        <Eye className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex-1">
          Showing <span className="font-semibold">{shortNameOf(focusCaptainName)}</span>&apos;s
          tables
        </span>
        <Button variant="outline" size="sm" onClick={() => assignment.setFocusCaptainId(null)}>
          Show all
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
      <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex-1 text-muted-foreground">
        <span className="lg:hidden">Tap tables, then tap a captain below.</span>
        <span className="hidden lg:inline">
          Select tables, then drag them onto a captain or use Assign to…
        </span>
      </span>
      {visibleUnassignedIds.length > 0 && (
        <button
          type="button"
          onClick={() => assignment.selectMany(visibleUnassignedIds, true)}
          className="font-medium underline underline-offset-4 hover:text-foreground"
        >
          Select all without captain
        </button>
      )}
    </div>
  );
}
