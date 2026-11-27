'use client';

import {
  ACTIVE_AI_JOB_STATUSES,
  AI_JOB_EVENT,
  type AiJob,
  type AiJobDetailResponse,
  aiJobEventSchema,
  type AiJobItem,
} from '@rms/api-contract';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Pusher from 'pusher-js';
import { useEffect, useState } from 'react';

import {
  AiQueryKey,
  authorizeAiChannel,
  fetchAiJob,
  useAiRealtime,
} from '@/services/api/requests/ai';
import { useAccessToken } from '@/store/hooks/auth';

const ACTIVE = new Set<string>(ACTIVE_AI_JOB_STATUSES);

export function isActiveJob(job: AiJob | null | undefined): boolean {
  return Boolean(job && ACTIVE.has(job.status));
}

/**
 * A job and its rows, live. Rows arrive on the owner's private Pusher channel the moment they are
 * read; the query also polls while the job runs (fast when the socket is down), so a dropped event
 * or a refreshed tab never loses a row. Everything is keyed by `seq`, so merges are idempotent.
 */
export function useAiJob(jobId: string | undefined): {
  job: AiJob | null;
  items: AiJobItem[];
  isError: boolean;
  refetch: () => void;
} {
  const queryClient = useQueryClient();
  const token = useAccessToken();
  const [connected, setConnected] = useState(false);
  const realtime = useAiRealtime(Boolean(jobId));

  const query = useQuery({
    queryKey: [AiQueryKey.Job, jobId],
    queryFn: () => fetchAiJob(jobId!),
    enabled: Boolean(jobId) && Boolean(token),
    refetchInterval: (current) =>
      isActiveJob(current.state.data?.job) ? (connected ? 8000 : 2500) : false,
    staleTime: 1000,
  });

  useEffect(() => {
    if (!jobId || !token || !realtime.data) return;
    const { key, cluster, channel: channelName } = realtime.data;
    let disposed = false;
    const client = new Pusher(key, {
      cluster,
      forceTLS: true,
      enabledTransports: ['ws'],
      disableStats: true,
      channelAuthorization: {
        customHandler: (params, callback) => {
          void authorizeAiChannel({ socket_id: params.socketId, channel_name: params.channelName })
            .then((auth) => !disposed && callback(null, auth))
            .catch(() => !disposed && callback(new Error('AI channel authorization failed'), null));
        },
      },
    });
    const channel = client.subscribe(channelName);
    const onSubscribed = (): void => setConnected(true);
    const onDown = ({ current }: { current: string }): void => {
      if (current !== 'connected') setConnected(false);
    };
    const onEvent = (payload: unknown): void => {
      const event = aiJobEventSchema.safeParse(payload);
      if (!event.success || disposed || event.data.jobId !== jobId) return;
      const { item, status, pagesDone, pagesTotal } = event.data;
      let needsRefetch = !ACTIVE.has(status);
      queryClient.setQueryData<AiJobDetailResponse>([AiQueryKey.Job, jobId], (current) => {
        if (!current) {
          needsRefetch = true;
          return current;
        }
        const items =
          item && !current.items.some((existing) => existing.seq === item.seq)
            ? [...current.items, item].sort((a, b) => a.seq - b.seq)
            : current.items;
        // Page statuses and the invoice header only come with a full fetch.
        if (!item) needsRefetch = true;
        return {
          job: { ...current.job, status, pagesDone, pagesTotal, itemCount: items.length },
          items,
        };
      });
      if (needsRefetch) void queryClient.invalidateQueries({ queryKey: [AiQueryKey.Job, jobId] });
    };
    channel.bind('pusher:subscription_succeeded', onSubscribed);
    channel.bind('pusher:subscription_error', () => setConnected(false));
    client.connection.bind('state_change', onDown);
    channel.bind(AI_JOB_EVENT, onEvent);
    return () => {
      disposed = true;
      setConnected(false);
      channel.unbind_all();
      client.connection.unbind('state_change', onDown);
      client.disconnect();
    };
  }, [jobId, token, realtime.data, queryClient]);

  return {
    job: query.data?.job ?? null,
    items: query.data?.items ?? [],
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
