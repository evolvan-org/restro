'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordRequestSchema } from '@rms/api-contract';
import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { useChangePassword, useProfile } from '@/services/api/requests/profile';
import { useLogout } from '@/store/hooks/auth';

type Values = { currentPassword: string; newPassword: string };

/** Shown instead of the app to accounts still on their one-time password. */
export default function ChangePassword(): ReactElement | null {
  const router = useRouter();
  const profile = useProfile();
  const logout = useLogout();
  const changePassword = useChangePassword();
  const form = useForm<Values>({
    resolver: zodResolver(changePasswordRequestSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  // Someone who doesn't need to change a password has no business here.
  useEffect(() => {
    if (profile.data && !profile.data.mustChangePassword) router.replace('/dashboard');
  }, [profile.data, router]);
  if (!profile.data?.mustChangePassword) return null;

  const { errors } = form.formState;
  return (
    <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Choose your own password</CardTitle>
          <CardDescription>
            You signed in with a one-time password. Replace it before you continue. You&apos;ll sign
            in again afterwards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={form.handleSubmit((values) => changePassword.mutate(values))}
          >
            <Field data-invalid={Boolean(errors.currentPassword)}>
              <FieldLabel htmlFor="cp-current">One-time password</FieldLabel>
              <PasswordInput
                id="cp-current"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.currentPassword)}
                {...form.register('currentPassword')}
              />
              <FieldError>{errors.currentPassword?.message}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.newPassword)}>
              <FieldLabel htmlFor="cp-new">New password</FieldLabel>
              <PasswordInput
                id="cp-new"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.newPassword)}
                {...form.register('newPassword')}
              />
              <FieldError>{errors.newPassword?.message}</FieldError>
            </Field>
            <Button type="submit" className="h-11" disabled={changePassword.isPending}>
              {changePassword.isPending ? 'Saving…' : 'Save new password'}
            </Button>
            <Button type="button" variant="ghost" className="h-11" onClick={logout}>
              Log out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
