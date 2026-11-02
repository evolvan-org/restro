import {
  kotBoardResponseSchema,
  type KotDestination,
  type KotQueueItem,
  kotQueueItemSchema,
  type TransitionKotStatusRequest,
  transitionKotStatusRequestSchema,
} from '@rms/api-contract';
import {
  useIsMutating,
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';
import { BOARD_REFRESH_MS } from '@/lib/board-refresh';

import { KotQueryKey } from '../types/KotQueryKey';
import { OrderQueryKey } from '../types/OrderQueryKey';

type TransitionVariables = { id: string; input: TransitionKotStatusRequest };
type TransitionContext = { previous: KotQueueItem | undefined };

export function useKotQueue(
  destination: KotDestination,
  enabled: boolean,
): UseQueryResult<KotQueueItem[]> {
  const pending = useIsMutating({ mutationKey: [KotQueryKey.Transition, destination] });
  return useQuery({
    queryKey: [KotQueryKey.Queue, destination],
    queryFn: async ({ signal }): Promise<KotQueueItem[]> => {
      const response = await api.get('/kots/board', {
        params: { destination },
        signal,
        errorDisplay: 'inline',
      });
      return kotBoardResponseSchema.parse(response.data).data;
    },
    // Cancel an overlapping read in onMutate, then suspend further reads until all
    // local advances settle. A stale poll can never overwrite an optimistic lane.
    enabled: enabled && pending === 0,
    refetchInterval: BOARD_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useTransitionKot(
  destination: KotDestination,
  ticketId: string,
): UseMutationResult<KotQueueItem, Error, TransitionVariables, TransitionContext> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to advance the ticket.');
  const queryKey = [KotQueryKey.Queue, destination];
  const mutationKey = [KotQueryKey.Transition, destination, ticketId];

  return useMutation<KotQueueItem, Error, TransitionVariables, TransitionContext>({
    mutationKey,
    mutationFn: async ({ id, input }) => {
      const response = await api.patch(
        `/kots/${id}/status`,
        transitionKotStatusRequestSchema.parse(input),
      );
      return kotQueueItemSchema.parse(response.data);
    },
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient
        .getQueryData<KotQueueItem[]>(queryKey)
        ?.find((ticket) => ticket.id === id);
      queryClient.setQueryData<KotQueueItem[]>(queryKey, (tickets) =>
        tickets?.flatMap((ticket) => {
          if (ticket.id !== id) return [ticket];
          if (input.status === 'COMPLETED') return [];
          return [
            {
              ...ticket,
              status: input.status,
              items: ticket.items.map((item) => ({ ...item, status: input.status })),
            },
          ];
        }),
      );
      return { previous };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<KotQueueItem[]>(queryKey, (tickets) =>
        tickets?.map((ticket) => (ticket.id === updated.id ? updated : ticket)),
      );
    },
    onError: (error, { id }, context) => {
      // Restore only this ticket; another card may have advanced concurrently.
      const previous = context?.previous;
      if (previous) {
        queryClient.setQueryData<KotQueueItem[]>(queryKey, (tickets) => [
          ...(tickets ?? []).filter((ticket) => ticket.id !== id),
          previous,
        ]);
      }
      showApiError(error);
    },
    onSettled: async () => {
      if (queryClient.isMutating({ mutationKey: [KotQueryKey.Transition, destination] }) === 1) {
        await queryClient.invalidateQueries({ queryKey });
      }
      await queryClient.invalidateQueries({ queryKey: [OrderQueryKey.Current] });
    },
  });
}
