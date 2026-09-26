import type { RegisterRequest } from '@rms/api-contract';
import { cn } from 'cn';
import type { UseFormRegister } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function RegisterForm({
  className,
  errors,
  isSubmitting,
  onSubmit,
  register,
  submitError,
  ...props
}: React.ComponentProps<'div'> & {
  errors?: Partial<Record<keyof RegisterRequest, string>>;
  isSubmitting?: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  register: UseFormRegister<RegisterRequest>;
  submitError?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Enter your details below to create a new account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field data-invalid={!!errors?.name}>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  type="text"
                  placeholder="Jane Doe"
                  aria-invalid={!!errors?.name}
                  {...register('name')}
                  required
                />
                <FieldError>{errors?.name}</FieldError>
              </Field>
              <Field data-invalid={!!errors?.email}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  aria-invalid={!!errors?.email}
                  {...register('email')}
                  required
                />
                <FieldError>{errors?.email}</FieldError>
              </Field>
              <Field data-invalid={!!errors?.password}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  aria-invalid={!!errors?.password}
                  {...register('password')}
                  required
                />
                <FieldError>{errors?.password}</FieldError>
              </Field>
              {submitError ? <FieldError>{submitError}</FieldError> : null}
              <Field>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating account...' : 'Create account'}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
