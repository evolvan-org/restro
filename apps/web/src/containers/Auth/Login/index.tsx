'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, type LoginRequest } from '@rms/api-contract';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { LoginForm } from '@/components/login-form';
import { useLogin } from '@/services/api/requests/auth';

export default function Login() {
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
        router.push('/');
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
