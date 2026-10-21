import {
  REALTIME_CHANGE_EVENT,
  realtimeChangeSchema,
  realtimeTopicForResource,
} from '@rms/api-contract';
import { useQueryClient } from '@tanstack/react-query';
import type Pusher from 'pusher-js';
import { useEffect } from 'react';

import { invalidateRealtimeResource } from '@/services/api/realtime';
import { authorizePusherChannel, getPusherConfig } from '@/services/api/requests/realtime';

import useShowApiError from './useShowApiError';

const CONFIG_QUERY_KEY = ['realtime-config'] as const;

/** One authenticated connection per protected layout; no timers or reconnect-triggered reads. */
export default function useRealtimeUpdates(accessToken: string | undefined): void {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to connect to real-time updates.');

  useEffect(() => {
    if (!accessToken) return;
    const sessionToken = accessToken;
    let disposed = false;
    let client: Pusher | undefined;

    async function connect(): Promise<void> {
      // A replacement session must not reuse a previous session's channel list or pending fetch.
      await queryClient.cancelQueries({ queryKey: CONFIG_QUERY_KEY });
      if (disposed) return;
      const config = await queryClient.fetchQuery({
        queryKey: CONFIG_QUERY_KEY,
        queryFn: ({ signal }) => getPusherConfig(sessionToken, signal),
        staleTime: 0,
        retry: false,
      });
      if (disposed) return;
      const { default: PusherClient } = await import('pusher-js');
      if (disposed) return;

      client = new PusherClient(config.key, {
        cluster: config.cluster,
        forceTLS: true,
        enabledTransports: ['ws'],
        enableStats: false,
        channelAuthorization: {
          customHandler: (params, callback) => {
            void authorizePusherChannel(
              { socket_id: params.socketId, channel_name: params.channelName },
              sessionToken,
            ).then(
              (response) => {
                if (!disposed) callback(null, response);
              },
              (error: unknown) => {
                if (!disposed) {
                  showApiError(error);
                  callback(new Error('Channel authorization failed'), null);
                }
              },
            );
          },
        },
      });

      client.connection.bind('error', () => {
        console.error('Pusher connection failed; no HTTP polling fallback is enabled.');
      });
      for (const { name, topic } of config.channels) {
        const channel = client.subscribe(name);
        channel.bind('pusher:subscription_error', () => {
          console.error('Pusher private-channel subscription failed.');
        });
        channel.bind(REALTIME_CHANGE_EVENT, (data: unknown) => {
          if (disposed) return;
          const change = realtimeChangeSchema.safeParse(data);
          if (!change.success || realtimeTopicForResource(change.data.resource) !== topic) {
            console.error('Ignored an invalid Pusher change notification.');
            return;
          }
          void invalidateRealtimeResource(queryClient, change.data.resource).catch(showApiError);
        });
      }
    }

    void connect().catch((error: unknown) => {
      if (!disposed) showApiError(error);
    });
    return () => {
      disposed = true;
      client?.disconnect();
      void queryClient.cancelQueries({ queryKey: CONFIG_QUERY_KEY });
    };
  }, [accessToken, queryClient, showApiError]);
}
