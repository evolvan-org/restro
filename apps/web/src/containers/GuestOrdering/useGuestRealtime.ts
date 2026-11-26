'use client';

import { QR_CHANGED_EVENT, type QrChangedEvent, qrChangedEventSchema } from '@rms/api-contract';
import { useQueryClient } from '@tanstack/react-query';
import Pusher from 'pusher-js';
import { useEffect, useRef, useState } from 'react';

import { authorizeGuestChannel, guestKeys } from './api';

/**
 * The guest phone's live link: a private channel per table visit, authorized with the device
 * secret. Every event refetches the session; on reconnect it resyncs. Returns whether the socket
 * is currently live (polling speeds up while it isn't).
 */
export default function useGuestRealtime(input: {
  token: string;
  secret: string | null;
  channel: string | null;
  config: { key: string; cluster: string } | null;
  onEvent: (event: QrChangedEvent) => void;
}): { live: boolean } {
  const { token, secret, channel: channelName, config } = input;
  const queryClient = useQueryClient();
  const onEventRef = useRef(input.onEvent);
  const [live, setLive] = useState(false);

  useEffect(() => {
    onEventRef.current = input.onEvent;
  }, [input.onEvent]);

  useEffect(() => {
    if (!secret || !channelName || !config) return;
    let disposed = false;
    const client = new Pusher(config.key, {
      cluster: config.cluster,
      forceTLS: true,
      disableStats: true,
      channelAuthorization: {
        customHandler: (params, callback) => {
          void authorizeGuestChannel(token, secret, {
            socket_id: params.socketId,
            channel_name: params.channelName,
          })
            .then((auth) => !disposed && callback(null, auth))
            .catch(() => !disposed && callback(new Error('Channel authorization failed'), null));
        },
      },
    });
    const channel = client.subscribe(channelName);
    const resync = (): void => {
      void queryClient.invalidateQueries({ queryKey: guestKeys.session(token) });
    };
    channel.bind('pusher:subscription_succeeded', () => {
      setLive(true);
      resync();
    });
    channel.bind(QR_CHANGED_EVENT, (payload: unknown) => {
      const event = qrChangedEventSchema.safeParse(payload);
      if (!event.success || disposed) return;
      resync();
      if (event.data.kind === 'captain.changed') {
        void queryClient.invalidateQueries({ queryKey: guestKeys.resolve(token) });
      }
      onEventRef.current(event.data);
    });
    const onState = ({ current }: { current: string }): void => {
      if (current !== 'connected') setLive(false);
    };
    client.connection.bind('state_change', onState);
    return () => {
      disposed = true;
      channel.unbind_all();
      client.connection.unbind('state_change', onState);
      client.disconnect();
      setLive(false);
    };
  }, [token, secret, channelName, config, queryClient]);

  return { live };
}
