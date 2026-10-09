import {
  type CreateReservationRequest,
  type CreateWalkInRequest,
  type GuestLookupResponse,
  guestLookupResponseSchema,
  type Reservation,
  reservationListResponseSchema,
  reservationSchema,
} from '@rms/api-contract';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect } from 'react';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';

import { ReservationQueryKey } from '../types/ReservationQueryKey';

const PAGE_SIZE = 100;

export function useReservations(enabled: boolean): UseQueryResult<Reservation[]> {
  const showApiError = useShowApiError('Unable to load reservations.');
  const query = useQuery({
    queryKey: [ReservationQueryKey.Reservations],
    queryFn: async (): Promise<Reservation[]> => {
      const firstResponse = await api.get('/reservations', {
        params: { page: 1, pageSize: PAGE_SIZE },
      });
      const firstPage = reservationListResponseSchema.parse(firstResponse.data);
      const reservations = [...firstPage.data];

      for (let page = 2; page <= firstPage.meta.totalPages; page += 1) {
        const response = await api.get('/reservations', {
          params: { page, pageSize: PAGE_SIZE },
        });
        reservations.push(...reservationListResponseSchema.parse(response.data).data);
      }

      return reservations;
    },
    enabled,
  });

  useEffect(() => {
    if (query.error) showApiError(query.error);
  }, [query.error, query.errorUpdatedAt, showApiError]);

  return query;
}

export function useCreateReservation(): UseMutationResult<
  Reservation,
  Error,
  CreateReservationRequest
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to create the reservation.');
  return useMutation<Reservation, Error, CreateReservationRequest>({
    mutationFn: async (input): Promise<Reservation> => {
      const response = await api.post('/reservations', input);
      return reservationSchema.parse(response.data);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [ReservationQueryKey.Reservations] }),
    onError: showApiError,
  });
}

export function useCreateWalkIn(): UseMutationResult<Reservation, Error, CreateWalkInRequest> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to register the walk-in.');
  return useMutation<Reservation, Error, CreateWalkInRequest>({
    mutationFn: async (input): Promise<Reservation> => {
      const response = await api.post('/walk-ins', input);
      return reservationSchema.parse(response.data);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [ReservationQueryKey.Reservations] }),
    onError: showApiError,
  });
}

export function useGuestLookup(
  phoneNumber: string,
  enabled: boolean,
): UseQueryResult<GuestLookupResponse> {
  return useQuery({
    queryKey: [ReservationQueryKey.GuestLookup, phoneNumber],
    queryFn: async (): Promise<GuestLookupResponse> => {
      const response = await api.get('/guests/lookup', {
        params: { phoneNumber },
      });
      return guestLookupResponseSchema.parse(response.data);
    },
    enabled,
  });
}
