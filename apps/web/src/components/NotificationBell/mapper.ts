import type { Notification } from '@rms/api-contract';

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
