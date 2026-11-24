'use client';

import { Permission } from '@rms/permissions';
import { Bell, Clock, Eye, Inbox, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement } from 'react';

import { SegmentedControl } from '@/components/ui/segmented-control';
import usePermissions from '@/hooks/auth/usePermissions';
import useNow from '@/hooks/useNow';
import usePersistedState from '@/hooks/usePersistedState';
import { formatWaiting } from '@/lib/qr';
import { useQrQueue, useQrSummary } from '@/services/api/requests/qr-orders';

import { PushToggle } from './PushToggle';
import { QueueSections } from './QueueSections';

type Scope = 'mine' | 'all';
const SCOPES: readonly Scope[] = ['mine', 'all'];

/** Captain approval queue for guest QR orders (C2a–C2e, C6a, C6b). */
export default function QrOrdersQueue(): ReactElement {
  const { can } = usePermissions();
  const [scope, setScope] = usePersistedState<Scope>('rms-qr-scope', 'mine', SCOPES);
  const queue = useQrQueue(scope);
  const summary = useQrSummary(true);
  const now = useNow(1000);
  const canManage = can(Permission.QR_ORDER_MANAGE);
  const data = queue.data;
  const readOnly = scope === 'all' && !canManage;
  const empty =
    data &&
    data.awaiting.length +
      data.sentToKitchen.length +
      data.billRequested.length +
      data.rejected.length ===
      0;
  const waiting = summary.data?.myWaitingCount ?? 0;
  const oldest = summary.data?.oldestWaitingSince;
  const oldestRound = data?.awaiting.find((card) => card.canAct);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 md:px-5">
      <div className="flex min-h-14 flex-wrap items-center gap-2.5 py-3">
        <h1 className="text-lg font-bold md:text-xl">QR orders</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <PushToggle />
          {canManage && (
            <Link
              href="/qr-orders/alerts"
              className="relative inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-semibold"
            >
              <Bell className="size-4" aria-hidden /> Alerts
              {(summary.data?.openAlerts ?? 0) > 0 && (
                <span
                  className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold text-white"
                  style={{ background: 'var(--qs-es)' }}
                >
                  {summary.data?.openAlerts}
                </span>
              )}
            </Link>
          )}
          <div className="w-full sm:w-[260px]">
            <SegmentedControl<Scope>
              idBase="qr-scope"
              aria-label="Which tables"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'mine', label: 'My tables' },
                { value: 'all', label: 'All tables' },
              ]}
            />
          </div>
        </div>
      </div>

      {waiting > 0 && oldest && (
        <div
          className="flex min-h-11 flex-wrap items-center gap-2.5 rounded-[9px] px-3.5 py-2.5 font-semibold"
          style={{
            background: 'var(--qs-aw-b)',
            color: 'var(--qs-aw-f)',
            boxShadow: 'inset 0 0 0 1px var(--qs-aw)',
          }}
          role="status"
          aria-live="polite"
        >
          <Clock className="size-4" aria-hidden />
          <span>
            {waiting} guest {waiting === 1 ? 'order' : 'orders'} waiting · oldest{' '}
            {formatWaiting(oldest, now)}
          </span>
          {oldestRound && (
            <Link
              href={`/qr-orders/rounds/${oldestRound.roundId}`}
              className="ml-auto underline-offset-2 hover:underline"
            >
              Review oldest →
            </Link>
          )}
        </div>
      )}

      {readOnly && (
        <div className="mt-3 flex items-center gap-2 rounded-[9px] bg-muted px-3 py-2.5">
          <Eye className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-[13px] text-muted-foreground">
            View only. Actions belong to each table’s captain.
          </span>
        </div>
      )}

      {queue.isPending ? (
        <QueueSkeleton />
      ) : queue.isError ? (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <TriangleAlert className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-muted-foreground">Couldn’t load QR orders.</p>
          <button
            type="button"
            className="min-h-11 rounded-md border px-4 font-semibold"
            onClick={() => void queue.refetch()}
          >
            Try again
          </button>
        </div>
      ) : empty ? (
        <div className="flex flex-col items-center gap-3 px-8 pt-[90px] text-center">
          <div className="flex size-[84px] items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Inbox className="size-9" aria-hidden />
          </div>
          <h2 className="text-xl font-bold">No guest orders waiting</h2>
          <p className="text-muted-foreground">
            New QR orders from your tables appear here with a sound and vibration.
          </p>
          <span className="mt-1.5 inline-flex h-[26px] items-center rounded-full border px-3 text-[11px] font-semibold">
            <span
              className="mr-1.5 size-2 rounded-full"
              style={{ background: 'var(--qs-rd)' }}
              aria-hidden
            />
            Live · listening for orders
          </span>
        </div>
      ) : data ? (
        <QueueSections data={data} now={now} readOnly={readOnly} />
      ) : null}
    </div>
  );
}

function QueueSkeleton(): ReactElement {
  return (
    <div className="mt-5 flex flex-col gap-2.5" aria-busy="true" aria-label="Loading QR orders">
      <div className="qr-skeleton h-3 w-40" />
      {[0, 1, 2].map((key) => (
        <div key={key} className="flex flex-col gap-2.5 rounded-[10px] border p-3.5">
          <div className="flex justify-between">
            <div className="qr-skeleton h-[22px] w-28" />
            <div className="qr-skeleton h-[26px] w-14" />
          </div>
          <div className="qr-skeleton h-3.5 w-3/5" />
          <div className="qr-skeleton h-3 w-4/5" />
          <div className="flex justify-between">
            <div className="qr-skeleton h-6 w-24 rounded-full" />
            <div className="qr-skeleton h-10 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
