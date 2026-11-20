'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ForgotPasswordRequest, forgotPasswordRequestSchema } from '@rms/api-contract';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useForgotPassword } from '@/services/api/requests/auth';

export default function ForgotPassword() {
  const request = useForgotPassword();
  const form = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(forgotPasswordRequestSchema),
    defaultValues: { email: '' },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot your password?</CardTitle>
        <CardDescription>Enter your email and we&apos;ll send a recovery link.</CardDescription>
      </CardHeader>
      <CardContent>
        {request.isSuccess ? (
          <div className="space-y-4 text-sm">
            <p>{request.data.message}</p>
            <Link href="/auth/login" className="underline underline-offset-4">
              Return to login
            </Link>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit((input) => request.mutate(input))}>
            <FieldGroup>
              <Field data-invalid={Boolean(form.formState.errors.email)}>
                <FieldLabel htmlFor="recovery-email">Email</FieldLabel>
                <Input id="recovery-email" type="email" {...form.register('email')} />
                <FieldError>{form.formState.errors.email?.message}</FieldError>
              </Field>
              {request.isError && <FieldError>Unable to process the request right now.</FieldError>}
              <Button type="submit" disabled={request.isPending}>
                {request.isPending ? 'Sending…' : 'Send recovery link'}
              </Button>
              <Link href="/auth/login" className="text-center text-sm underline underline-offset-4">
                Back to login
              </Link>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
