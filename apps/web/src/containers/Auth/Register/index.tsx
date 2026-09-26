'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerRequestSchema } from '@rms/api-contract';
import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { RegisterForm, type RegisterFormValues } from '@/components/register-form';
import { useRegister } from '@/services/api/requests/auth';

// FE-only: confirm-password is validated in the browser and never sent to the API.
const registerFormSchema = registerRequestSchema
  .extend({ confirmPassword: z.string().min(1) })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export default function Register(): ReactElement {
  const router = useRouter();
  const registerUser = useRegister();
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      name: '',
      restaurantName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = form.handleSubmit(({ confirmPassword: _confirmPassword, ...payload }) => {
    registerUser.mutate(payload, {
      onSuccess: () => {
        // The token is stored in onSuccess of useRegister; land on the dashboard.
        router.push('/dashboard');
      },
    });
  });

  return (
    <RegisterForm
      errors={{
        name: form.formState.errors.name?.message,
        restaurantName: form.formState.errors.restaurantName?.message,
        email: form.formState.errors.email?.message,
        password: form.formState.errors.password?.message,
        confirmPassword: form.formState.errors.confirmPassword?.message,
      }}
      isSubmitting={form.formState.isSubmitting || registerUser.isPending}
      onSubmit={onSubmit}
      register={form.register}
      submitError={registerUser.isError ? 'Unable to create account.' : undefined}
    />
  );
}
