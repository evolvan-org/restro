'use client';

import { BellRing } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { savePushSubscription, usePushConfig } from '@/services/api/requests/qr-orders';

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Offers lock-screen alerts (Web Push) the first time a captain opens QR orders. Browsers only allow
 * the permission prompt from a tap, which also unlocks the in-app chime.
 */
export function PushToggle(): ReactElement | null {
  const config = usePushConfig(true);
  const [state, setState] = useState<'unknown' | 'granted' | 'default' | 'denied' | 'unsupported'>(
    'unknown',
  );

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      !('serviceWorker' in navigator)
    ) {
      setState('unsupported');
      return;
    }
    setState(Notification.permission);
    if (Notification.permission === 'granted' && config.data?.publicKey) {
      void subscribe(config.data.publicKey).catch(() => undefined);
    }
  }, [config.data?.publicKey]);

  async function subscribe(publicKey: string): Promise<void> {
    const registration = await navigator.serviceWorker.register('/sw.js');
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      }));
    await savePushSubscription(subscription.toJSON());
  }

  async function enable(): Promise<void> {
    if (!config.data?.publicKey) return;
    const permission = await Notification.requestPermission();
    setState(permission);
    if (permission !== 'granted') {
      toast.info('Alerts stay in the app. You can allow notifications later in browser settings.');
      return;
    }
    try {
      await subscribe(config.data.publicKey);
      toast.success('Lock-screen alerts are on for this device.');
    } catch {
      toast.error('Could not turn on lock-screen alerts on this device.');
    }
  }

  if (!config.data?.publicKey || state !== 'default') return null;
  return (
    <Button variant="outline" className="min-h-11" onClick={() => void enable()}>
      <BellRing aria-hidden /> Turn on lock-screen alerts
    </Button>
  );
}
