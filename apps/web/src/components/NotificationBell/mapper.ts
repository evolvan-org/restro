import type { Notification } from '@rms/api-contract';

export function notificationView(
  notification: Notification,
  permissions: { canReadOrders: boolean; canWriteReservations: boolean },
): { category: string; tone: string; action: string | null } {
  const category = {
    'kot.sent': 'New KOT',
    'kot.ready': 'Ready to serve',
    'reservation.created': 'Reservation',
  }[notification.type];
  const action =
    notification.entity === 'order' && notification.tableId && permissions.canReadOrders
      ? 'View order'
      : notification.entity === 'reservation' && permissions.canWriteReservations
        ? 'View reservation'
        : null;
  return {
    category,
    tone:
      notification.type === 'kot.ready'
        ? 'ready'
        : notification.entity === 'reservation'
          ? 'reservation'
          : 'ticket',
    action,
  };
}

export function notificationPanelDescription(permissions: {
  canManageRestaurant: boolean;
  canManageReservations: boolean;
  canUpdateKots: boolean;
}): string {
  if (permissions.canManageRestaurant) return 'Restaurant and service updates';
  if (permissions.canManageReservations) return 'Guest bookings and service updates';
  if (permissions.canUpdateKots) return 'Kitchen and bar ticket updates';
  return 'Your recent updates';
}

export function notificationBody(notification: Notification): string {
  if (notification.type !== 'reservation.created') return notification.body;
  const boundary = notification.body.lastIndexOf(', ');
  if (boundary < 0) return notification.body;
  const date = new Date(notification.body.slice(boundary + 2));
  if (Number.isNaN(date.getTime())) return notification.body;
  return (
    notification.body.slice(0, boundary + 2) +
    new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  );
}

export function notificationTimeAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
