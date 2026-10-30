'use client';

import { Popover } from '@base-ui/react/popover';
import type { Notification } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { Bell, CheckCheck, Volume2, VolumeX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import usePermissions from '@/hooks/auth/usePermissions';
import useNotificationFeedback from '@/hooks/useNotificationFeedback';
import useNotificationSubscription from '@/hooks/useNotificationSubscription';
import {
  useMarkNotificationsRead,
  useNotificationOrder,
  useNotificationReservation,
  useNotifications,
} from '@/services/api/requests/notifications';
import { useShowSidePane } from '@/store/hooks/sidepane';
import { SidePaneType } from '@/store/types/sidepane';

import { notificationBody, notificationTimeAgo } from './mapper';

export default function NotificationBell(): ReactElement {
  const notifications = useNotifications();
  const { muted, toggleMuted, play } = useNotificationFeedback();
  const realtime = useNotificationSubscription(play);
  const { mutateAsync: markRead, isPending: markingRead } = useMarkNotificationsRead();
  const {
    mutateAsync: openReservation,
    isPending: openingReservation,
    isSuccess: reservationOpened,
    data: reservation,
    reset: resetReservation,
  } = useNotificationReservation();
  const {
    mutateAsync: openOrder,
    isPending: openingOrder,
    isSuccess: orderOpened,
    data: order,
    reset: resetOrder,
  } = useNotificationOrder();
  const showSidePane = useShowSidePane();
  const { can } = usePermissions();
  const router = useRouter();
  // Popover visibility is interaction state, independent of query/form state.
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.data?.unreadCount ?? 0;
  const entries = notifications.data?.data ?? [];
  const busy = markingRead || openingReservation || openingOrder;

  useEffect(() => {
    if (orderOpened && order) {
      setOpen(false);
      router.push(`/orders/tables/${order.tableId}`);
      resetOrder();
    }
  }, [orderOpened, order, router, resetOrder]);

  useEffect(() => {
    if (reservationOpened && reservation) {
      setOpen(false);
      showSidePane(SidePaneType.ReservationEdit, { reservation });
      resetReservation();
    }
  }, [reservationOpened, reservation, showSidePane, resetReservation]);

  const handleReadAll = async (): Promise<void> => {
    try {
      await markRead(undefined);
    } catch {
      // The mutation hook reports the failure; retain the open panel.
    }
  };

  const handleSelect = async (notification: Notification): Promise<void> => {
    try {
      if (!notification.readAt) await markRead(notification.id);
      if (notification.entity === 'order' && notification.tableId && can(Permission.ORDER_READ)) {
        await openOrder({ tableId: notification.tableId, orderId: notification.entityId });
      } else if (notification.entity === 'reservation' && can(Permission.RESERVATION_WRITE)) {
        await openReservation(notification.entityId);
      }
    } catch {
      // Request hooks own error presentation; leave the panel available for retry.
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void notifications.refetch();
      }}
    >
      <Popover.Trigger
        render={<Button variant="ghost" size="icon-sm" className="relative" />}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell aria-hidden />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
            aria-hidden
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Popover.Popup className="w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lg outline-none">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <Popover.Title className="text-sm font-medium text-muted-foreground">
                Notifications
              </Popover.Title>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={toggleMuted}
                  aria-label={muted ? 'Unmute notification sounds' : 'Mute notification sounds'}
                  aria-pressed={muted}
                >
                  {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void handleReadAll()}
                  disabled={busy || unreadCount === 0}
                  aria-label="Mark all notifications read"
                >
                  <CheckCheck aria-hidden />
                </Button>
              </div>
            </div>
            <Popover.Description className="sr-only">
              Your latest 20 notifications, newest first. Select an alert to mark it read and open
              its record.
            </Popover.Description>
            {realtime.isError && (
              <p className="px-3 py-2 text-xs text-destructive">
                Live updates unavailable. Reopen this panel to refresh.
              </p>
            )}
            {notifications.isError && (
              <div role="alert" className="p-4 text-sm">
                <p>Unable to load notifications.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void notifications.refetch()}
                >
                  Try again
                </Button>
              </div>
            )}
            {notifications.isPending && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Loading notifications…
              </p>
            )}
            {!notifications.isPending && !notifications.isError && entries.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
            )}
            <ul className="max-h-96 overflow-y-auto" aria-label="Recent notifications">
              {entries.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSelect(notification)}
                    className="w-full px-3 py-3 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      {!notification.readAt && (
                        <span
                          className="size-1.5 shrink-0 rounded-full bg-primary"
                          aria-label="Unread"
                        />
                      )}
                      <span className="min-w-0 flex-1 text-sm font-medium">
                        {notification.title}
                      </span>
                      <time
                        dateTime={notification.createdAt}
                        title={new Date(notification.createdAt).toLocaleString()}
                        className="shrink-0 text-[11px] text-muted-foreground"
                      >
                        {notificationTimeAgo(notification.createdAt)}
                      </time>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {notificationBody(notification)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
