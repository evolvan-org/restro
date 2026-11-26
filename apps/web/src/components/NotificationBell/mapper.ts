import type { Notification } from '@rms/api-contract';

const CATEGORIES: Record<Notification['type'], string> = {
  'kot.sent': 'New KOT',
  'kot.ready': 'Ready to serve',
  'reservation.created': 'Reservation',
  'qr.order.submitted': 'QR order',
  'qr.order.escalated': 'Escalated',
  'qr.no-captain': 'Needs a captain',
  'qr.bill.requested': 'Bill requested',
  'qr.call-server': 'Guest calling',
  'qr.payment.requested': 'Wants to pay',
};

/** Where a QR notification opens in the staff app, or null when the viewer can't open it. */
export function qrNotificationHref(
  notification: Notification,
  permissions: { canReadQrOrders: boolean; canManageQrOrders: boolean },
): string | null {
  if (notification.type === 'qr.order.escalated' || notification.type === 'qr.no-captain') {
    return permissions.canManageQrOrders ? '/qr-orders/alerts' : null;
  }
  if (!permissions.canReadQrOrders) return null;
  if (notification.entity === 'qr-round') return `/qr-orders/rounds/${notification.entityId}`;
  if (notification.entity === 'qr-session') {
    return notification.type === 'qr.call-server'
      ? '/qr-orders'
      : `/qr-orders/sessions/${notification.entityId}/bill`;
  }
  return null;
}

export function notificationView(
  notification: Notification,
  permissions: {
    canReadOrders: boolean;
    canWriteReservations: boolean;
    canReadQrOrders?: boolean;
    canManageQrOrders?: boolean;
  },
): { category: string; tone: string; action: string | null } {
  const category = CATEGORIES[notification.type];
  const qrHref = qrNotificationHref(notification, {
    canReadQrOrders: permissions.canReadQrOrders ?? false,
    canManageQrOrders: permissions.canManageQrOrders ?? false,
  });
  const action = notification.type.startsWith('qr.')
    ? qrHref
      ? notification.type === 'qr.order.submitted'
        ? 'Review order'
        : notification.type === 'qr.bill.requested' || notification.type === 'qr.payment.requested'
          ? 'Open bill'
          : 'Open'
      : null
    : notification.entity === 'order' && notification.tableId && permissions.canReadOrders
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
