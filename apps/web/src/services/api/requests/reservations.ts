import {
  type AssignReservationTableRequest,
  type AssignReservationTableResponse,
  assignReservationTableResponseSchema,
  type CancelReservationRequest,
  cancelReservationRequestSchema,
  type CreateReservationRequest,
  type CreateWalkInRequest,
  type GuestLookupResponse,
  guestLookupResponseSchema,
  type Reservation,
  type ReservationListQuery,
  type ReservationListResponse,
  reservationListResponseSchema,
  reservationSchema,
  type UpdateReservationRequest,
  updateReservationRequestSchema,
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
import { TableQueryKey } from '../types/TableQueryKey';

type CancelReservationVariables = { id: string; input: CancelReservationRequest };
type UpdateReservationVariables = { id: string; input: UpdateReservationRequest };
type AssignReservationTableVariables = { id: string; input: AssignReservationTableRequest };

export async function getReservation(id: string): Promise<Reservation> {
  const response = await api.get(`/reservations/${id}`);
  return reservationSchema.parse(response.data);
}

export function useAssignReservationTable(): UseMutationResult<
  AssignReservationTableResponse,
  Error,
  AssignReservationTableVariables
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to change the table assignment.');

  return useMutation<AssignReservationTableResponse, Error, AssignReservationTableVariables>({
    mutationFn: async ({ id, input }): Promise<AssignReservationTableResponse> => {
      const response = await api.patch(`/reservations/${id}/table`, input);
      return assignReservationTableResponseSchema.parse(response.data);
    },
    onSuccess: async (reservation) => {
      queryClient.setQueriesData<ReservationListResponse>(
        { queryKey: [ReservationQueryKey.Reservations] },
        (current) =>
          current && {
            ...current,
            data: current.data.map((item) => (item.id === reservation.id ? reservation : item)),
          },
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [ReservationQueryKey.Reservations] }),
        queryClient.invalidateQueries({ queryKey: [TableQueryKey.Tables] }),
      ]);
    },
    onError: showApiError,
  });
}

export function useUpdateReservation(): UseMutationResult<
  Reservation,
  Error,
  UpdateReservationVariables
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to update the reservation.');

  return useMutation<Reservation, Error, UpdateReservationVariables>({
    mutationFn: async ({ id, input }): Promise<Reservation> => {
      const response = await api.patch(
        `/reservations/${id}`,
        updateReservationRequestSchema.parse(input),
      );
      return reservationSchema.parse(response.data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: [ReservationQueryKey.Reservations] }),
        queryClient.cancelQueries({ queryKey: [ReservationQueryKey.GuestLookup] }),
      ]);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [ReservationQueryKey.Reservations],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: [ReservationQueryKey.GuestLookup],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({ queryKey: [TableQueryKey.Tables] }),
      ]);
    },
    onError: showApiError,
  });
}

export function useCancelReservation(): UseMutationResult<
  Reservation,
  Error,
  CancelReservationVariables
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to cancel the reservation.');

  return useMutation<Reservation, Error, CancelReservationVariables>({
    mutationFn: async ({ id, input }): Promise<Reservation> => {
      const response = await api.patch(
        `/reservations/${id}/cancel`,
        cancelReservationRequestSchema.parse(input),
      );
      return reservationSchema.parse(response.data);
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.cancelQueries({ queryKey: [ReservationQueryKey.Reservations] });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [ReservationQueryKey.Reservations],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({ queryKey: [TableQueryKey.Tables] }),
      ]);
    },
    onError: showApiError,
  });
}

/** One page of reservations; the previous page stays visible while the next one loads. */
export function useReservations(
  query: ReservationListQuery,
  enabled: boolean,
): UseQueryResult<ReservationListResponse> {
  return useQuery({
    queryKey: [ReservationQueryKey.Reservations, query],
    queryFn: async ({ signal }): Promise<ReservationListResponse> => {
      const response = await api.get('/reservations', { params: query, signal });
      return reservationListResponseSchema.parse(response.data);
    },
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 0,
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
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [ReservationQueryKey.Reservations] }),
        queryClient.invalidateQueries({ queryKey: [TableQueryKey.Tables] }),
      ]),
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
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [ReservationQueryKey.Reservations] }),
        queryClient.invalidateQueries({ queryKey: [TableQueryKey.Tables] }),
      ]),
    onError: showApiError,
  });
}

/** Shortest phone number worth looking up; avoids a request per keystroke while staff type. */
export const GUEST_LOOKUP_MIN_LENGTH = 3;

export function useGuestLookup(phoneNumber: string): UseQueryResult<GuestLookupResponse> {
  return useQuery({
    queryKey: [ReservationQueryKey.GuestLookup, phoneNumber],
    queryFn: async ({ signal }): Promise<GuestLookupResponse> => {
      const response = await api.get('/reservations/guests/lookup', {
        params: { phoneNumber },
        signal,
      });
      return guestLookupResponseSchema.parse(response.data);
    },
    enabled: phoneNumber.length >= GUEST_LOOKUP_MIN_LENGTH,
    staleTime: 0,
  });
}
