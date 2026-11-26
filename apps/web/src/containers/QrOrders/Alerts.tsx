'use client';

import type { QrAlert } from '@rms/api-contract';
import { ArrowLeft, Check, Info, TriangleAlert, User, Users, UserX } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ReactElement, useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import useNow from '@/hooks/useNow';
import { firstNameOf, formatRupees, formatWaiting, minutesAgo } from '@/lib/qr';
import { useDismissQrAlert, useQrAlerts } from '@/services/api/requests/qr-orders';

import { AssignCaptainSheet } from './AssignCaptainSheet';

/** Manager alerts (M1 escalation, M2 no-captain scan) with one-tap fixes. */
export default function QrAlerts(): ReactElement {
  const alerts = useQrAlerts(true);
  const dismiss = useDismissQrAlert();
  const now = useNow(1000);
  const params = useSearchParams();
  const reassignTable = params.get('reassign');
  const [sheet, setSheet] = useState<QrAlert | 'param' | null>(reassignTable ? 'param' : null);
  const data = alerts.data;
  const paramAlert = data?.open.find((alert) => alert.table.id === reassignTable) ?? null;
  const active = sheet === 'param' ? paramAlert : sheet;

  return (
    <div className="mx-auto w-full max-w-2xl pb-10">
      <div className="flex min-h-14 items-center gap-2.5 border-b px-2">
        <Link
          href="/qr-orders"
          aria-label="Back to QR orders"
          className={buttonVariants({ variant: 'ghost', size: 'icon-lg' })}
        >
          <ArrowLeft aria-hidden />
        </Link>
        <h1 className="flex-1 text-lg font-bold">Alerts</h1>
      </div>
      {alerts.isPending ? (
        <div className="flex flex-col gap-3 p-4" aria-busy="true">
          <div className="qr-skeleton h-44 w-full" />
        </div>
      ) : !data ? (
        <p className="p-8 text-center text-muted-foreground">Alerts couldn’t be loaded.</p>
      ) : (
        <>
          {data.open.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-8 pt-16 text-center">
              <Check className="size-8 text-muted-foreground" aria-hidden />
              <h2 className="text-lg font-bold">Nothing needs you right now</h2>
              <p className="text-muted-foreground">
                Escalated orders and tables without a captain show up here.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-3.5 px-4 pt-3.5">
            {data.open.map((alert) =>
              alert.kind === 'ESCALATION' ? (
                <article
                  key={alert.id}
                  className="qr-slidein overflow-hidden rounded-[10px] border bg-card"
                  style={{ borderColor: 'var(--qs-es)' }}
                >
                  <div
                    className="flex items-center gap-2.5 px-3.5 py-2.5 font-bold text-white"
                    style={{ background: 'var(--qs-es-b)' }}
                  >
                    <TriangleAlert className="size-4" aria-hidden /> Escalated · needs a manager
                    {alert.waitingSince && (
                      <span className="ml-auto tabular-nums">
                        {formatWaiting(alert.waitingSince, now)}
                      </span>
                    )}
                  </div>
                  <div className="p-3.5">
                    <b className="text-[17px] leading-snug">
                      Order waiting {waitedMinutes(alert, now)}m at Table {alert.table.number}
                      {alert.captain ? ` · Captain: ${firstNameOf(alert.captain.name)}` : ''}
                    </b>
                    <div className="mt-1.5 text-[13px] text-muted-foreground">
                      Round {alert.roundNumber} · {alert.guestCount}{' '}
                      {alert.guestCount === 1 ? 'guest' : 'guests'} · {alert.itemCount}{' '}
                      {alert.itemCount === 1 ? 'item' : 'items'}
                      {alert.total ? ` · ${formatRupees(alert.total)}` : ''} · timeout is{' '}
                      {data.escalationMinutes} min
                    </div>
                    <div className="mt-3.5 flex flex-col gap-2.5">
                      <Link
                        href={`/qr-orders/rounds/${alert.roundId}`}
                        className={buttonVariants({ className: 'min-h-14 w-full text-base' })}
                      >
                        <Check aria-hidden /> Approve myself
                      </Link>
                      <div className="flex gap-2.5">
                        <Button
                          variant="outline"
                          className="min-h-[52px] flex-1"
                          onClick={() => setSheet(alert)}
                        >
                          <Users aria-hidden /> Reassign
                        </Button>
                        <Link
                          href={`/qr-orders/rounds/${alert.roundId}`}
                          className={buttonVariants({
                            variant: 'outline',
                            className: 'min-h-[52px] flex-1',
                          })}
                        >
                          View order
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              ) : (
                <article
                  key={alert.id}
                  className="qr-slidein overflow-hidden rounded-[10px] border bg-card"
                >
                  <div className="flex items-center gap-2.5 bg-muted px-3.5 py-2.5 font-bold">
                    <UserX className="size-4" aria-hidden /> Table needs a captain
                    <span className="ml-auto font-medium text-muted-foreground">
                      {minutesAgo(alert.createdAt, now)}
                    </span>
                  </div>
                  <div className="p-3.5">
                    <b className="text-[17px] leading-snug">
                      A guest scanned Table {alert.table.number}, which has no captain assigned
                    </b>
                    <div className="mt-1.5 text-[13px] text-muted-foreground">
                      They’re seeing “Ordering isn’t available at this table” and may try again in a
                      moment.
                    </div>
                    <div className="mt-3.5 flex flex-col gap-2.5">
                      <Button className="min-h-14 w-full text-base" onClick={() => setSheet(alert)}>
                        <User aria-hidden /> Assign captain
                      </Button>
                      <Button
                        variant="outline"
                        className="min-h-12"
                        disabled={dismiss.isPending}
                        onClick={() => dismiss.mutate(alert.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </article>
              ),
            )}
          </div>
          {data.open.some((alert) => alert.kind === 'NO_CAPTAIN') && (
            <div className="px-4">
              <h2 className="mt-[18px] mb-2 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
                Tip
              </h2>
              <div className="flex items-center gap-2.5 rounded-[9px] bg-muted p-3">
                <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-[13px] text-muted-foreground">
                  Assign captains to tables before service so QR ordering is on at every table.
                </span>
              </div>
            </div>
          )}
          {data.recent.length > 0 && (
            <div className="px-4">
              <h2 className="mt-[18px] mb-2 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
                Earlier
              </h2>
              <ul className="m-0 list-none p-0">
                {data.recent.map((alert) => (
                  <li key={alert.id} className="flex items-center gap-3 border-b py-3.5">
                    <span className="flex size-9 items-center justify-center rounded-full bg-muted">
                      {alert.kind === 'ESCALATION' ? (
                        <TriangleAlert className="size-4" aria-hidden />
                      ) : (
                        <UserX className="size-4" aria-hidden />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <b>
                        {alert.kind === 'ESCALATION'
                          ? `Table ${alert.table.number} escalated`
                          : `Table ${alert.table.number} scanned with no captain`}
                      </b>
                      <span className="text-[13px] text-muted-foreground">
                        {alert.resolution ?? 'Handled'}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {minutesAgo(alert.resolvedAt ?? alert.createdAt, now)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <AssignCaptainSheet
        open={sheet !== null && active !== null}
        onOpenChange={(open) => !open && setSheet(null)}
        table={active?.table ?? null}
        currentCaptain={active?.kind === 'ESCALATION' ? (active.captain?.name ?? null) : null}
        waitingText={
          active?.kind === 'ESCALATION' && active.waitingSince
            ? `1 order waiting ${formatWaiting(active.waitingSince, now)}`
            : null
        }
      />
    </div>
  );
}

function waitedMinutes(alert: QrAlert, now: number): number {
  if (!alert.waitingSince) return 0;
  return Math.max(1, Math.floor((now - new Date(alert.waitingSince).getTime()) / 60_000));
}
