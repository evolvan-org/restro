'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type LoginRequest,
  loginRequestSchema,
  onboardingIncompleteErrorSchema,
} from '@rms/api-contract';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';
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

  const onSubmit = form.handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: ({ onboarding, mustChangePassword }) => {
        try {
          // A fresh login shows "Welcome back" once, so forget the previous session's visit.
          window.sessionStorage.removeItem(WELCOMED_SESSION_KEY);
        } catch {
          // Session storage unavailable: the card just shows again.
        }
        // Land inside the signed-in shell so navigation (and Log out) is available.
        router.push(
          mustChangePassword
            ? '/change-password'
            : onboarding === 'PENDING'
              ? '/onboarding'
              : '/dashboard',
        );
      },
    });
  });

  const notReady = login.isError
    ? getApiErrorBody(login.error, onboardingIncompleteErrorSchema)
    : undefined;
  const submitError = !login.isError
    ? undefined
    : notReady
      ? undefined
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
        email: form.formState.errors.email?.message,
        password: form.formState.errors.password?.message,
      }}
      isSubmitting={form.formState.isSubmitting || login.isPending}
      onSubmit={onSubmit}
      register={form.register}
      submitError={submitError}
    />
  );
}
