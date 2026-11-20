import {
  type AcceptInviteRequest,
  type AcceptInviteResponse,
  acceptInviteResponseSchema,
  type ForgotPasswordRequest,
  type ForgotPasswordResponse,
  forgotPasswordResponseSchema,
  type LoginRequest,
  type LoginResponse,
  loginResponseSchema,
  type RegisterRequest,
  type RegisterResponse,
  registerResponseSchema,
  type ResendVerificationResponse,
  resendVerificationResponseSchema,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
  resetPasswordResponseSchema,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
  verifyEmailResponseSchema,
} from '@rms/api-contract';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import useAppDispatch from '@/store/hooks/useAppDispatch';
import { actions } from '@/store/slices/auth';

import { ProfileQueryKey } from '../types/ProfileQueryKey';

const useLogin = () => {
  const dispatch = useAppDispatch();

  return useMutation({
    mutationFn: async (loginRequest: LoginRequest): Promise<LoginResponse> => {
      // The login form renders failures itself (including the "not ready yet" notice).
      const response = await api.post('/auth/login', loginRequest, { errorDisplay: 'inline' });
      return loginResponseSchema.parse(response.data);
    },
    onSuccess: (response) => {
      dispatch(actions.login({ accessToken: response.accessToken }));
    },
  });
};

const useRegister = () => {
  const dispatch = useAppDispatch();

  return useMutation({
    mutationFn: async (registerRequest: RegisterRequest): Promise<RegisterResponse> => {
      const response = await api.post('/auth/register', registerRequest);
      return registerResponseSchema.parse(response.data);
    },
    onSuccess: (response) => {
      dispatch(actions.login({ accessToken: response.accessToken }));
    },
  });
};

const useVerifyEmail = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: VerifyEmailRequest): Promise<VerifyEmailResponse> => {
      const response = await api.post('/auth/verify-email', input);
      return verifyEmailResponseSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ProfileQueryKey.Profile] }),
  });
};

const useResendVerification = () =>
  useMutation({
    mutationFn: async (): Promise<ResendVerificationResponse> => {
      const response = await api.post('/auth/resend-verification');
      return resendVerificationResponseSchema.parse(response.data);
    },
  });

const useForgotPassword = () =>
  useMutation({
    mutationFn: async (input: ForgotPasswordRequest): Promise<ForgotPasswordResponse> => {
      const response = await api.post('/auth/forgot-password', input);
      return forgotPasswordResponseSchema.parse(response.data);
    },
  });

const useResetPassword = () =>
  useMutation({
    mutationFn: async (input: ResetPasswordRequest): Promise<ResetPasswordResponse> => {
      const response = await api.post('/auth/reset-password', input);
      return resetPasswordResponseSchema.parse(response.data);
    },
  });

const useAcceptInvite = () =>
  useMutation({
    mutationFn: async (input: AcceptInviteRequest): Promise<AcceptInviteResponse> => {
      const response = await api.post('/auth/accept-invite', input);
      return acceptInviteResponseSchema.parse(response.data);
    },
  });

export {
  useAcceptInvite,
  useForgotPassword,
  useLogin,
  useRegister,
  useResendVerification,
  useResetPassword,
  useVerifyEmail,
};
