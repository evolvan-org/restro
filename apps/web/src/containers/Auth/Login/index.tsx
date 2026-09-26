'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginRequest, loginRequestSchema } from '@rms/api-contract';
import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { LoginForm } from '@/components/login-form';
import { useLogin } from '@/services/api/requests/auth';

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
      onSuccess: () => {
        // Land on a page inside the signed-in shell so navigation (and Log out) is available.
        router.push('/profile');
      },
    });
  });

  return (
    <LoginForm
      errors={{
        email: form.formState.errors.email?.message,
        password: form.formState.errors.password?.message,
      }}
      isSubmitting={form.formState.isSubmitting || login.isPending}
      onSubmit={onSubmit}
      register={form.register}
      submitError={login.isError ? 'Invalid email or password.' : undefined}
    />
  );
}
