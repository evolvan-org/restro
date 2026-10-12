import {
  type CreateReservationRequest,
  type CreateWalkInRequest,
  type GuestLookupResponse,
  guestLookupResponseSchema,
  type Reservation,
  type ReservationListQuery,
  type ReservationListResponse,
  reservationListResponseSchema,
  reservationSchema,
} from '@rms/api-contract';
import {
  keepPreviousData,
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';

import { ReservationQueryKey } from '../types/ReservationQueryKey';

/** One page of reservations; the previous page stays visible while the next one loads. */
export function useReservations(
  query: ReservationListQuery,
  enabled: boolean,
): UseQueryResult<ReservationListResponse> {
  return useQuery({
    queryKey: [ReservationQueryKey.Reservations, query],
    queryFn: async (): Promise<ReservationListResponse> => {
      const response = await api.get('/reservations', { params: query });
      return reservationListResponseSchema.parse(response.data);
    },
    placeholderData: keepPreviousData,
    enabled,
  });
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
      const response = await api.post('/reservations/walk-ins', input);
      return reservationSchema.parse(response.data);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [ReservationQueryKey.Reservations] }),
    onError: showApiError,
  });
}

/** Shortest phone number worth looking up; avoids a request per keystroke while staff type. */
export const GUEST_LOOKUP_MIN_LENGTH = 3;

export function useGuestLookup(phoneNumber: string): UseQueryResult<GuestLookupResponse> {
  return useQuery({
    queryKey: [ReservationQueryKey.GuestLookup, phoneNumber],
    queryFn: async (): Promise<GuestLookupResponse> => {
      const response = await api.get('/reservations/guests/lookup', {
        params: { phoneNumber },
      });
      return guestLookupResponseSchema.parse(response.data);
    },
    enabled: phoneNumber.length >= GUEST_LOOKUP_MIN_LENGTH,
  });
}
