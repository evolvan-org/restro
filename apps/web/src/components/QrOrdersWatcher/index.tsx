'use client';

import { Permission } from '@rms/permissions';
import { Bell, Clock, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactElement, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import usePermissions from '@/hooks/auth/usePermissions';
import useNotificationFeedback from '@/hooks/useNotificationFeedback';
import useNow from '@/hooks/useNow';
import useQrRealtime from '@/hooks/useQrRealtime';
import { formatRupees, formatWaiting } from '@/lib/qr';
import { useQrAlerts, useQrQueue, useQrSummary } from '@/services/api/requests/qr-orders';

/**
 * App-wide QR ordering presence for staff: live channel, the new-order toast with chime and
 * vibration (C1a) for the owner captain, the escalation toast for managers (CP2) and the
 * persistent "N orders waiting · oldest m:ss" strip.
 */
export default function QrOrdersWatcher(): ReactElement | null {
  const { can } = usePermissions();
  const canRead = can(Permission.QR_ORDER_READ);
  const canManage = can(Permission.QR_ORDER_MANAGE);
  const liveEnabled = canRead || can(Permission.KOT_READ) || can(Permission.FLOOR_READ);
  useQrRealtime(liveEnabled);

  const summary = useQrSummary(canRead);
  const queue = useQrQueue('mine', canRead);
  const alerts = useQrAlerts(canManage);
  const { play } = useNotificationFeedback();
  const router = useRouter();
  const pathname = usePathname();
  const now = useNow(1000);

  // New rounds on my tables: toast + chime + vibration, once per round.
  const seenRounds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const data = queue.data;
    if (!data) return;
    const mine = data.awaiting.filter((card) => card.canAct && card.captain);
    if (seenRounds.current === null) {
      seenRounds.current = new Set(mine.map((card) => card.roundId));
      return;
    }
    const fresh = mine.filter((card) => !seenRounds.current?.has(card.roundId));
    for (const card of fresh) {
      seenRounds.current.add(card.roundId);
      play('order');
      toast.custom(
        (id) => (
          <div
            role="status"
            className="qr-slidein w-[min(22rem,calc(100vw-1.25rem))] rounded-[14px] bg-primary p-3.5 text-primary-foreground shadow-[0_14px_34px_rgb(0_0_0/0.4)]"
          >
            <div className="flex items-center gap-3">
              <div
                className="qr-ring flex size-11 shrink-0 items-center justify-center rounded-xl"
                style={{ background: 'var(--qs-aw)', color: '#2a1700' }}
                aria-hidden
              >
                <Bell className="size-5" strokeWidth={2.4} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <b className="text-base">New order · Table {card.table.number}</b>
                <span className="text-[13px] opacity-85">
                  Round {card.roundNumber} · {card.itemCount}{' '}
                  {card.itemCount === 1 ? 'item' : 'items'} · {formatRupees(card.total)}
                </span>
              </div>
              <span className="text-[13px] opacity-70">now</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="min-h-11 flex-1 rounded-md bg-primary-foreground px-4 text-sm font-semibold text-primary"
                onClick={() => {
                  toast.dismiss(id);
                  router.push(`/qr-orders/rounds/${card.roundId}`);
                }}
              >
                Review
              </button>
              <button
                type="button"
                className="min-h-11 rounded-md border border-white/35 px-4 text-sm font-semibold"
                onClick={() => toast.dismiss(id)}
              >
                Later
              </button>
            </div>
          </div>
        ),
        { duration: 12_000, id: `qr-round-${card.roundId}` },
      );
    }
    for (const id of [...seenRounds.current]) {
      if (!mine.some((card) => card.roundId === id)) seenRounds.current.delete(id);
    }
  }, [queue.data, play, router]);

  // Escalations for managers: toast + double chime. No-captain alerts stay silent (bell only).
  const seenAlerts = useRef<Set<string> | null>(null);
  useEffect(() => {
    const data = alerts.data;
    if (!data) return;
    const escalations = data.open.filter((alert) => alert.kind === 'ESCALATION');
    if (seenAlerts.current === null) {
      seenAlerts.current = new Set(escalations.map((alert) => alert.id));
      return;
    }
    for (const alert of escalations) {
      if (seenAlerts.current.has(alert.id)) continue;
      seenAlerts.current.add(alert.id);
      play('escalation');
      const minutes = alert.waitingSince
        ? Math.max(1, Math.round((Date.now() - new Date(alert.waitingSince).getTime()) / 60_000))
        : data.escalationMinutes;
      toast.custom(
        (id) => (
          <div
            role="alert"
            className="qr-slidein w-[min(22rem,calc(100vw-1.25rem))] overflow-hidden rounded-[14px] border bg-card text-card-foreground shadow-lg"
            style={{ borderColor: 'var(--qs-es)' }}
          >
            <div
              className="flex items-center gap-2.5 px-3.5 py-2.5 font-bold text-white"
              style={{ background: 'var(--qs-es-b)' }}
            >
              <TriangleAlert className="size-4" aria-hidden /> Escalated · needs a manager
              <button
                type="button"
                aria-label="Dismiss"
                className="ml-auto flex size-8 items-center justify-center"
                onClick={() => toast.dismiss(id)}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="p-3.5">
              <b className="text-[15px] leading-snug">
                Order waiting {minutes}m at Table {alert.table.number}
                {alert.captain ? ` · Captain: ${alert.captain.name.split(' ')[0]}` : ''}
              </b>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="min-h-11 flex-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
                  onClick={() => {
                    toast.dismiss(id);
                    router.push(
                      alert.roundId ? `/qr-orders/rounds/${alert.roundId}` : '/qr-orders/alerts',
                    );
                  }}
                >
                  Approve myself
                </button>
                <button
                  type="button"
                  className="min-h-11 flex-1 rounded-md border px-3 text-sm font-semibold"
                  onClick={() => {
                    toast.dismiss(id);
                    router.push(`/qr-orders/alerts?reassign=${alert.table.id}`);
                  }}
                >
                  Reassign
                </button>
              </div>
            </div>
          </div>
        ),
        { duration: 20_000, id: `qr-alert-${alert.id}` },
      );
    }
  }, [alerts.data, play, router]);

  const waiting = summary.data?.myWaitingCount ?? 0;
  const oldest = summary.data?.oldestWaitingSince;
  if (!canRead || waiting === 0 || !oldest || pathname.startsWith('/qr-orders')) return null;
  return (
    <Link
      href="/qr-orders"
      className="flex min-h-11 items-center gap-2.5 border-b px-4 py-2.5 text-sm font-semibold"
      style={{
        background: 'var(--qs-aw-b)',
        color: 'var(--qs-aw-f)',
        borderColor: 'var(--qs-aw)',
      }}
    >
      <Clock className="size-4" aria-hidden />
      <span>
        {waiting} {waiting === 1 ? 'order' : 'orders'} waiting · oldest {formatWaiting(oldest, now)}
      </span>
      <span className="ml-auto">Review oldest →</span>
    </Link>
  );
}
