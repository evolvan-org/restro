'use client';

import {
  GUEST_SECRET_HEADER,
  type QrAddCartItemRequest,
  type QrChannelAuthResponse,
  qrChannelAuthResponseSchema,
  type QrJoinRequest,
  qrJoinResponseSchema,
  type QrMenuResponse,
  qrMenuResponseSchema,
  type QrRequestPaymentRequest,
  type QrResolveResponse,
  qrResolveResponseSchema,
  type QrSessionResponse,
  qrSessionResponseSchema,
  type QrSplitRequest,
} from '@rms/api-contract';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import axios, { type AxiosError } from 'axios';
import { useCallback, useSyncExternalStore } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/** Public, unauthenticated client: never carries the staff token or its 401 handling. */
export const guestApi = axios.create({ baseURL: API_URL, timeout: 15_000 });

export type GuestApiError = AxiosError<{ message?: string | string[]; statusCode?: number }>;

export function guestErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Try again.',
): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(message)) return message.map((m) => m.replace(/^[\w.]+: /, '')).join(' ');
    if (typeof message === 'string') return message;
    if (!error.response) return 'No connection. Check your internet and try again.';
  }
  return fallback;
}

export function errorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

// ----- Device secret (one per table token) -----

type StoredGuest = { secret: string; sessionId: string; name: string; phone: string };
const key = (token: string): string => `restro.qr.${token}`;
const PROFILE_KEY = 'restro.qr.profile';
const CHANGE = 'restro:qr-guest';

function read(token: string): StoredGuest | null {
  try {
    const raw = window.localStorage.getItem(key(token));
    return raw ? (JSON.parse(raw) as StoredGuest) : null;
  } catch {
    return null;
  }
}

/** Remembered name/phone to prefill the join form next time (on this device only). */
export function readProfile(): { name: string; phone: string } | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as { name: string; phone: string }) : null;
  } catch {
    return null;
  }
}

export function saveGuest(token: string, value: StoredGuest): void {
  try {
    window.localStorage.setItem(key(token), JSON.stringify(value));
    window.localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({ name: value.name, phone: value.phone }),
    );
  } catch {
    // Private mode: the visit still works for this tab.
    memory.set(token, value);
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function clearGuest(token: string): void {
  memory.delete(token);
  try {
    window.localStorage.removeItem(key(token));
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(CHANGE));
}

const memory = new Map<string, StoredGuest>();

export function useGuestSecret(token: string): string | null {
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener(CHANGE, listener);
    window.addEventListener('storage', listener);
    return () => {
      window.removeEventListener(CHANGE, listener);
      window.removeEventListener('storage', listener);
    };
  }, []);
  const getSnapshot = useCallback((): string | null => {
    return read(token)?.secret ?? memory.get(token)?.secret ?? null;
  }, [token]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

// ----- Queries -----

export const guestKeys = {
  resolve: (token: string) => ['qr-guest', token, 'resolve'] as const,
  menu: (token: string) => ['qr-guest', token, 'menu'] as const,
  session: (token: string) => ['qr-guest', token, 'session'] as const,
};

export function useQrResolve(token: string): UseQueryResult<QrResolveResponse> {
  return useQuery({
    queryKey: guestKeys.resolve(token),
    queryFn: async ({ signal }) =>
      qrResolveResponseSchema.parse((await guestApi.get(`/qr/${token}`, { signal })).data),
    retry: (count, error) => errorStatus(error) === undefined && count < 3,
    staleTime: 30_000,
  });
}

export function useQrMenu(token: string, enabled: boolean): UseQueryResult<QrMenuResponse> {
  return useQuery({
    queryKey: guestKeys.menu(token),
    queryFn: async ({ signal }) =>
      qrMenuResponseSchema.parse((await guestApi.get(`/qr/${token}/menu`, { signal })).data),
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useQrSession(
  token: string,
  secret: string | null,
  live: boolean,
): UseQueryResult<QrSessionResponse> {
  return useQuery({
    queryKey: guestKeys.session(token),
    queryFn: async ({ signal }) =>
      qrSessionResponseSchema.parse(
        (
          await guestApi.get(`/qr/${token}/session`, {
            signal,
            headers: { [GUEST_SECRET_HEADER]: secret ?? '' },
          })
        ).data,
      ),
    enabled: Boolean(secret),
    // Pusher pushes changes; poll quickly only while the socket is down (reconnect + resync).
    refetchInterval: live ? 30_000 : 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: (count, error) => errorStatus(error) === undefined && count < 5,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });
}

export async function authorizeGuestChannel(
  token: string,
  secret: string,
  input: { socket_id: string; channel_name: string },
): Promise<QrChannelAuthResponse> {
  const response = await guestApi.post(`/qr/${token}/realtime/auth`, input, {
    headers: { [GUEST_SECRET_HEADER]: secret },
  });
  return qrChannelAuthResponseSchema.parse(response.data);
}

// ----- Mutations (each returns the fresh session snapshot) -----

function useSessionMutation<TVariables>(
  token: string,
  secret: string | null,
  request: (variables: TVariables, headers: Record<string, string>) => Promise<unknown>,
): UseMutationResult<QrSessionResponse, unknown, TVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables) =>
      qrSessionResponseSchema.parse(
        await request(variables, { [GUEST_SECRET_HEADER]: secret ?? '' }),
      ),
    onSuccess: (session) => queryClient.setQueryData(guestKeys.session(token), session),
    onError: (error) => {
      if (errorStatus(error) === 401 || errorStatus(error) === 410) clearGuest(token);
      void queryClient.invalidateQueries({ queryKey: guestKeys.session(token) });
    },
  });
}

export function useJoin(token: string): UseMutationResult<void, unknown, QrJoinRequest> {
  return useMutation({
    mutationFn: async (input) => {
      const result = qrJoinResponseSchema.parse(
        (await guestApi.post(`/qr/${token}/join`, input)).data,
      );
      saveGuest(token, {
        secret: result.guestSecret,
        sessionId: result.sessionId,
        name: input.name,
        phone: input.phone,
      });
    },
  });
}

export function useAddToCart(token: string, secret: string | null) {
  return useSessionMutation<QrAddCartItemRequest>(
    token,
    secret,
    async (input, headers) =>
      (await guestApi.post(`/qr/${token}/cart/items`, input, { headers })).data,
  );
}

export function useUpdateCartLine(token: string, secret: string | null) {
  return useSessionMutation<{ lineId: string; quantity: number }>(
    token,
    secret,
    async ({ lineId, quantity }, headers) =>
      (await guestApi.patch(`/qr/${token}/cart/items/${lineId}`, { quantity }, { headers })).data,
  );
}

export function useSubmitRound(token: string, secret: string | null) {
  return useSessionMutation<{ idempotencyKey: string; note?: string }>(
    token,
    secret,
    async (input, headers) => (await guestApi.post(`/qr/${token}/rounds`, input, { headers })).data,
  );
}

export function useRestoreRound(token: string, secret: string | null) {
  return useSessionMutation<string>(
    token,
    secret,
    async (roundId, headers) =>
      (await guestApi.post(`/qr/${token}/rounds/${roundId}/restore`, {}, { headers })).data,
  );
}

export function useRequestBill(token: string, secret: string | null) {
  return useSessionMutation<void>(
    token,
    secret,
    async (_input, headers) =>
      (await guestApi.post(`/qr/${token}/bill-request`, {}, { headers })).data,
  );
}

export function useSplit(token: string, secret: string | null) {
  return useSessionMutation<QrSplitRequest>(
    token,
    secret,
    async (input, headers) => (await guestApi.post(`/qr/${token}/split`, input, { headers })).data,
  );
}

export function useRequestPayment(token: string, secret: string | null) {
  return useSessionMutation<{ shareId: string; input: QrRequestPaymentRequest }>(
    token,
    secret,
    async ({ shareId, input }, headers) =>
      (await guestApi.post(`/qr/${token}/shares/${shareId}/pay`, input, { headers })).data,
  );
}

export function useCallServer(
  token: string,
  secret: string | null,
): UseMutationResult<unknown, unknown, void> {
  return useMutation({
    mutationFn: async () =>
      (
        await guestApi.post(
          `/qr/${token}/call-server`,
          {},
          {
            headers: { [GUEST_SECRET_HEADER]: secret ?? '' },
          },
        )
      ).data,
  });
}
