import type { RegisterRequest } from '@rms/api-contract';
import { cn } from 'cn';
import Link from 'next/link';
import type { UseFormRegister } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';

/** Register form values, including the FE-only confirm-password field. */
export type RegisterFormValues = RegisterRequest & { confirmPassword: string };

export function RegisterForm({
  className,
  errors,
  isSubmitting,
  onSubmit,
  register,
  submitError,
  ...props
}: React.ComponentProps<'div'> & {
  errors?: Partial<Record<keyof RegisterFormValues, string>>;
  isSubmitting?: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  register: UseFormRegister<RegisterFormValues>;
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
              <Field data-invalid={!!errors?.restaurantName}>
                <FieldLabel htmlFor="restaurantName">Restaurant name</FieldLabel>
                <Input
                  id="restaurantName"
                  type="text"
                  placeholder="Jane's Bistro"
                  aria-invalid={!!errors?.restaurantName}
                  {...register('restaurantName')}
                  required
                />
                <FieldError>{errors?.restaurantName}</FieldError>
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
                <PasswordInput
                  id="password"
                  aria-invalid={!!errors?.password}
                  {...register('password')}
                  required
                />
                <FieldError>{errors?.password}</FieldError>
              </Field>
              <Field data-invalid={!!errors?.confirmPassword}>
                <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
                <PasswordInput
                  id="confirmPassword"
                  aria-invalid={!!errors?.confirmPassword}
                  {...register('confirmPassword')}
                  required
                />
                <FieldError>{errors?.confirmPassword}</FieldError>
              </Field>
              {submitError && <FieldError>{submitError}</FieldError>}
              <Field>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating account...' : 'Create account'}
                </Button>
              </Field>
              <FieldDescription className="text-center">
                Already have an account?{' '}
                <Link href="/auth/login" className="underline underline-offset-4">
                  Login
                </Link>
              </FieldDescription>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
