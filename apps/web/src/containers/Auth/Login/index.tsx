'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  API_ERROR_CODES,
  errorResponseSchema,
  type LoginRequest,
  loginRequestSchema,
  onboardingIncompleteErrorSchema,
} from '@rms/api-contract';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { LoginForm } from '@/components/login-form';
import { getApiErrorBody, getApiErrorMessage } from '@/lib/api-error';
import { useLogin } from '@/services/api/requests/auth';

import { WELCOMED_SESSION_KEY } from '../../Onboarding/steps';

export default function Login(): ReactElement {
  const router = useRouter();
  const login = useLogin();
  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const [requiresCode, setRequiresCode] = useState(false);
  const { mutateAsync: signIn, data: signedIn } = login;

  useEffect(() => {
    if (!signedIn) return;
    try {
      window.sessionStorage.removeItem(WELCOMED_SESSION_KEY);
    } catch {
      // Session storage is optional.
    }
    router.push(
      signedIn.mustChangePassword
        ? '/change-password'
        : signedIn.onboarding === 'PENDING'
          ? '/onboarding'
          : '/dashboard',
    );
  }, [router, signedIn]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await signIn(values);
    } catch (error) {
      const body = getApiErrorBody(error, errorResponseSchema);
      if (body?.code === API_ERROR_CODES.AUTHENTICATOR_REQUIRED) setRequiresCode(true);
    }
  });

  const notReady = login.isError
    ? getApiErrorBody(login.error, onboardingIncompleteErrorSchema)
    : undefined;
  const code = getApiErrorBody(login.error, errorResponseSchema)?.code;
  const submitError =
    !login.isError || code === API_ERROR_CODES.AUTHENTICATOR_REQUIRED
      ? undefined
      : notReady
        ? undefined
        : code === API_ERROR_CODES.AUTHENTICATOR_INVALID
          ? 'Verification code is invalid, expired, or already used.'
          : axios.isAxiosError(login.error) && login.error.response?.status === 401
            ? 'Invalid email or password.'
            : getApiErrorMessage(login.error, 'Unable to log in. Please try again.');

  return (
    <LoginForm
      notice={
        notReady
          ? {
              title: `${notReady.restaurantName} isn't ready yet`,
              body: 'The owner is still setting up the restaurant. You can log in as soon as setup is finished.',
            }
          : undefined
      }
      errors={{
        verificationCode: form.formState.errors.verificationCode?.message,
        email: form.formState.errors.email?.message,
        password: form.formState.errors.password?.message,
      }}
      requiresCode={requiresCode}
      isSubmitting={form.formState.isSubmitting || login.isPending}
      onSubmit={onSubmit}
      register={form.register}
      submitError={submitError}
    />
  );
}
