import {
  authenticatorDisabledSchema,
  authenticatorDisableSchema,
  authenticatorEnabledSchema,
  authenticatorEnableSchema,
  authenticatorPasswordSchema,
  authenticatorSetupSchema,
  authenticatorStatusSchema,
} from '@rms/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';
import { useLogin } from '@/store/hooks/auth';

const endpoint = '/auth/authenticator';
const statusKey = ['authenticator-status'];

export function useAuthenticatorStatus() {
  return useQuery({
    queryKey: statusKey,
    queryFn: async () => authenticatorStatusSchema.parse((await api.get(endpoint)).data),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useAuthenticatorSetup() {
  const showError = useShowApiError('Unable to start authenticator setup.');
  return useMutation({
    mutationFn: async (input: z.infer<typeof authenticatorPasswordSchema>) =>
      authenticatorSetupSchema.parse(
        (await api.post(endpoint + '/setup', input, { errorDisplay: 'inline' })).data,
      ),
    onError: showError,
    gcTime: 0,
  });
}

export function useEnableAuthenticator() {
  const putAccessToken = useLogin();
  const client = useQueryClient();
  const showError = useShowApiError('Unable to enable the authenticator.');
  return useMutation({
    mutationFn: async (input: z.infer<typeof authenticatorEnableSchema>) => {
      const result = authenticatorEnabledSchema.parse(
        (await api.post(endpoint + '/enable', input, { errorDisplay: 'inline' })).data,
      );
      putAccessToken({ accessToken: result.accessToken });
      return result.recoveryCodes;
    },
    onError: showError,
    onSuccess: async (codes) => {
      await client.cancelQueries({ queryKey: statusKey });
      client.setQueryData(statusKey, { enabled: true, recoveryCodesRemaining: codes.length });
    },
    gcTime: 0,
  });
}

export function useDisableAuthenticator() {
  const putAccessToken = useLogin();
  const client = useQueryClient();
  const showError = useShowApiError('Unable to disable the authenticator.');
  return useMutation({
    mutationFn: async (input: z.infer<typeof authenticatorDisableSchema>) => {
      const result = authenticatorDisabledSchema.parse(
        (await api.post(endpoint + '/disable', input, { errorDisplay: 'inline' })).data,
      );
      putAccessToken({ accessToken: result.accessToken });
      return result.message;
    },
    onError: showError,
    onSuccess: async () => {
      await client.cancelQueries({ queryKey: statusKey });
      client.setQueryData(statusKey, { enabled: false, recoveryCodesRemaining: 0 });
    },
  });
}
