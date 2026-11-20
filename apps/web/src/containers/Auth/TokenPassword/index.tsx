'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  acceptInviteRequestSchema,
  resetPasswordRequestSchema,
  userPasswordSchema,
} from '@rms/api-contract';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { useAcceptInvite, useResetPassword } from '@/services/api/requests/auth';

const formSchema = z
  .object({ password: userPasswordSchema, confirmPassword: z.string().min(1) })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type FormValues = z.infer<typeof formSchema>;

export default function TokenPassword({ mode }: { mode: 'reset' | 'invite' }) {
  const params = useSearchParams();
  const router = useRouter();
  const token = useState(() => params.get('token'))[0];
  const reset = useResetPassword();
  const accept = useAcceptInvite();
  const mutation = mode === 'reset' ? reset : accept;
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  useEffect(() => {
    router.replace(mode === 'reset' ? '/auth/reset-password' : '/auth/accept-invite');
  }, [mode, router]);

  const submit = form.handleSubmit(({ password }) => {
    if (!token) return;
    if (mode === 'reset') {
      reset.mutate(resetPasswordRequestSchema.parse({ token, newPassword: password }));
    } else {
      accept.mutate(acceptInviteRequestSchema.parse({ token, password }));
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === 'reset' ? 'Choose a new password' : 'Accept invitation'}</CardTitle>
        <CardDescription>
          {mode === 'reset'
            ? 'Your new password will sign out all existing sessions.'
            : 'Set your password to activate your staff account.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mutation.isSuccess ? (
          <div className="space-y-4 text-sm">
            <p>{mutation.data.message}</p>
            <Link href="/auth/login" className="underline underline-offset-4">
              Sign in
            </Link>
          </div>
        ) : !token ? (
          <p role="alert" className="text-sm text-destructive">
            This link is missing or invalid.
          </p>
        ) : (
          <form onSubmit={submit}>
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.password)}>
                <FieldLabel htmlFor="new-password">New password</FieldLabel>
                <PasswordInput id="new-password" {...form.register('password')} />
                <FieldError>{form.formState.errors.password?.message}</FieldError>
              </Field>
              <Field data-invalid={Boolean(form.formState.errors.confirmPassword)}>
                <FieldLabel htmlFor="confirm-new-password">Confirm password</FieldLabel>
                <PasswordInput id="confirm-new-password" {...form.register('confirmPassword')} />
                <FieldError>{form.formState.errors.confirmPassword?.message}</FieldError>
              </Field>
              {mutation.isError && (
                <FieldError>This link is invalid, expired, or has already been used.</FieldError>
              )}
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending
                  ? 'Saving…'
                  : mode === 'reset'
                    ? 'Reset password'
                    : 'Activate account'}
              </Button>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
