'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type RegisterRequest,registerRequestSchema } from '@rms/api-contract';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { RegisterForm } from '@/components/register-form';
import { useRegister } from '@/services/api/requests/auth';

export default function Register() {
  const router = useRouter();
  const registerUser = useRegister();
  const form = useForm<RegisterRequest>({
    resolver: zodResolver(registerRequestSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    registerUser.mutate(values, {
      onSuccess: () => {
        router.push('/auth/login');
      },
    });
  });

  return (
    <RegisterForm
      errors={{
        name: form.formState.errors.name?.message,
        email: form.formState.errors.email?.message,
        password: form.formState.errors.password?.message,
      }}
      isSubmitting={form.formState.isSubmitting || registerUser.isPending}
      onSubmit={onSubmit}
      register={form.register}
      submitError={registerUser.isError ? 'Unable to create account.' : undefined}
    />
  );
}
