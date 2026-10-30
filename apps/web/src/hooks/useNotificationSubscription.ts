'use client';

import { NOTIFICATION_CHANGED_EVENT, notificationChangedEventSchema } from '@rms/api-contract';
import { useQueryClient } from '@tanstack/react-query';
import Pusher from 'pusher-js';
import { useEffect, useRef, useState } from 'react';

import {
  authorizeNotificationChannel,
  useNotificationRealtime,
} from '@/services/api/requests/notifications';
import { NotificationQueryKey } from '@/services/api/types/NotificationQueryKey';
import { useAccessToken } from '@/store/hooks/auth';

export default function useNotificationSubscription(onCreated: () => void): { isError: boolean } {
  const settings = useNotificationRealtime();
  const token = useAccessToken();
  const queryClient = useQueryClient();
  const onCreatedRef = useRef(onCreated);
  // Connection readiness is local transport state; API data/errors remain in TanStack Query.
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'unavailable'>(
    'connecting',
  );

  useEffect(() => {
    onCreatedRef.current = onCreated;
  }, [onCreated]);

  useEffect(() => {
    if (!token || !settings.data) return;
    const { key, cluster, channel: channelName } = settings.data;
    setConnection('connecting');
    let disposed = false;
    const client = new Pusher(key, {
      cluster,
      forceTLS: true,
      enabledTransports: ['ws'],
      disableStats: true,
      channelAuthorization: {
        customHandler: (params, callback) => {
          void authorizeNotificationChannel(
            {
              socket_id: params.socketId,
              channel_name: params.channelName,
            },
            token,
          )
            .then((auth) => {
              if (!disposed) callback(null, auth);
            })
            .catch(() => {
              if (!disposed) callback(new Error('Notification authorization failed'), null);
            });
        },
      },
    });
    const channel = client.subscribe(channelName);
    const onSubscribed = (): void => setConnection('connected');
    const onUnavailable = (): void => setConnection('unavailable');
    const onStateChanged = ({ current }: { current: string }): void => {
      if (current === 'unavailable' || current === 'failed' || current === 'disconnected') {
        onUnavailable();
      }
    };
    channel.bind('pusher:subscription_succeeded', onSubscribed);
    channel.bind('pusher:subscription_error', onUnavailable);
    client.connection.bind('state_change', onStateChanged);
    const onChanged = (payload: unknown): void => {
      const event = notificationChangedEventSchema.safeParse(payload);
      if (!event.success || disposed) return;
      void queryClient.invalidateQueries({ queryKey: [NotificationQueryKey.List] });
      if (event.data.kind === 'created') onCreatedRef.current();
    };
    channel.bind(NOTIFICATION_CHANGED_EVENT, onChanged);
    return () => {
      disposed = true;
      channel.unbind(NOTIFICATION_CHANGED_EVENT, onChanged);
      channel.unbind('pusher:subscription_succeeded', onSubscribed);
      channel.unbind('pusher:subscription_error', onUnavailable);
      client.connection.unbind('state_change', onStateChanged);
      client.disconnect();
    };
  }, [token, settings.data, queryClient]);

  return { isError: settings.isError || connection === 'unavailable' };
}
