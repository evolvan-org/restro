'use client';

import { QR_CHANGED_EVENT, type QrChangedEvent, qrChangedEventSchema } from '@rms/api-contract';
import { useQueryClient } from '@tanstack/react-query';
import Pusher from 'pusher-js';
import { useEffect, useRef, useState } from 'react';

import { authorizeQrChannel, useQrRealtimeConfig } from '@/services/api/requests/qr-orders';
import { KotQueryKey } from '@/services/api/types/KotQueryKey';
import { QrQueryKey } from '@/services/api/types/QrQueryKey';
import { TableQueryKey } from '@/services/api/types/TableQueryKey';
import { useAccessToken } from '@/store/hooks/auth';

/**
 * Subscribes to the restaurant's private staff QR channel. Every event refetches the QR views,
 * station boards and floor board (events carry ids only); when the socket is down the queries'
 * own polling keeps screens current.
 */
export default function useQrRealtime(
  enabled: boolean,
  onEvent?: (event: QrChangedEvent) => void,
): { connected: boolean } {
  const config = useQrRealtimeConfig(enabled);
  const token = useAccessToken();
  const queryClient = useQueryClient();
  const onEventRef = useRef(onEvent);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || !token || !config.data) return;
    const { key, cluster, channel: channelName } = config.data;
    let disposed = false;
    const client = new Pusher(key, {
      cluster,
      forceTLS: true,
      enabledTransports: ['ws'],
      disableStats: true,
      channelAuthorization: {
        customHandler: (params, callback) => {
          void authorizeQrChannel(
            { socket_id: params.socketId, channel_name: params.channelName },
            token,
          )
            .then((auth) => {
              if (!disposed) callback(null, auth);
            })
            .catch(() => {
              if (!disposed) callback(new Error('QR channel authorization failed'), null);
            });
        },
      },
    });
    const channel = client.subscribe(channelName);
    const refresh = (): void => {
      for (const key of [
        QrQueryKey.Queue,
        QrQueryKey.Summary,
        QrQueryKey.Round,
        QrQueryKey.Bill,
        QrQueryKey.Alerts,
        QrQueryKey.Floor,
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      void queryClient.invalidateQueries({ queryKey: [KotQueryKey.Queue] });
      void queryClient.invalidateQueries({ queryKey: [TableQueryKey.Tables, 'board'] });
    };
    const onSubscribed = (): void => {
      setConnected(true);
      // Resync anything missed while disconnected.
      refresh();
    };
    const onState = ({ current }: { current: string }): void => {
      if (current !== 'connected') setConnected(false);
    };
    const onChanged = (payload: unknown): void => {
      const event = qrChangedEventSchema.safeParse(payload);
      if (!event.success || disposed) return;
      refresh();
      onEventRef.current?.(event.data);
    };
    channel.bind('pusher:subscription_succeeded', onSubscribed);
    channel.bind(QR_CHANGED_EVENT, onChanged);
    client.connection.bind('state_change', onState);
    return () => {
      disposed = true;
      channel.unbind_all();
      client.connection.unbind('state_change', onState);
      client.disconnect();
      setConnected(false);
    };
  }, [enabled, token, config.data, queryClient]);

  return { connected };
}
