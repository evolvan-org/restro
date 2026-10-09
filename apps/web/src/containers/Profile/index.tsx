'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  type UpdateProfileRequest,
  updateProfileRequestSchema,
} from '@rms/api-contract';
import { KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { type ReactElement, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import useShowApiError from '@/hooks/api/useShowApiError';
import { formatRoleLabel } from '@/lib/utils';
import { useChangePassword, useProfile, useUpdateProfile } from '@/services/api/requests/profile';

export default function Profile(): ReactElement {
  const profile = useProfile();
  const {
    mutateAsync: updateProfile,
    isPending: isUpdatingProfile,
    isSuccess: isProfileUpdated,
  } = useUpdateProfile();
  const {
    mutateAsync: changePassword,
    data: passwordResponse,
    isPending: isChangingPassword,
    isSuccess: isPasswordChanged,
  } = useChangePassword();
  const showApiError = useShowApiError('Unable to load your profile.');

  const profileForm = useForm<UpdateProfileRequest>({
    resolver: zodResolver(updateProfileRequestSchema),
    defaultValues: {
      name: '',
      phone: '',
    },
  });

  const passwordForm = useForm<ChangePasswordRequest>({
    resolver: zodResolver(changePasswordRequestSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
    },
  });

  useEffect(() => {
    if (profile.data) {
      profileForm.reset({
        name: profile.data.name,
        phone: profile.data.phone ?? '',
      });
    }
  }, [profile.data, profileForm]);

  useEffect(() => {
    if (profile.error) showApiError(profile.error);
  }, [profile.error, profile.errorUpdatedAt, showApiError]);

  useEffect(() => {
    if (isPasswordChanged) passwordForm.reset();
  }, [isPasswordChanged, passwordForm]);

  const submitProfile = profileForm.handleSubmit(async (values) => {
    try {
      await updateProfile({
        name: values.name,
        phone: values.phone || null,
      });
    } catch {
      // The mutation hook reports the error through useShowApiError; preserve the form values.
    }
  });

  const submitPassword = passwordForm.handleSubmit(async (values) => {
    try {
      await changePassword(values);
    } catch {
      // The mutation hook reports the error through useShowApiError; preserve the form values.
    }
  });

  if (profile.isPending) {
    return (
      <main className="mx-auto flex max-w-6xl items-center justify-center px-6 py-24">
        <p className="text-sm text-muted-foreground">Loading your profile…</p>
      </main>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <main className="mx-auto flex max-w-6xl items-center justify-center px-6 py-24">
        <div className="space-y-4 text-center">
          <p role="alert" className="text-sm text-destructive">
            Unable to load your profile.
          </p>
          <Button type="button" variant="outline" onClick={() => profile.refetch()}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
      <div className="mb-8 max-w-2xl">
        <p className="text-sm font-medium text-muted-foreground">Account settings</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Personal profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Keep your contact information current and manage your password.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound aria-hidden />
              Profile information
            </CardTitle>
            <CardDescription>Update the details associated with your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitProfile} noValidate>
              <FieldGroup>
                <Field data-invalid={Boolean(profileForm.formState.errors.name)}>
                  <FieldLabel htmlFor="profile-name">Name</FieldLabel>
                  <Input
                    id="profile-name"
                    autoComplete="name"
                    aria-invalid={Boolean(profileForm.formState.errors.name)}
                    {...profileForm.register('name')}
                  />
                  <FieldError>{profileForm.formState.errors.name?.message}</FieldError>
                </Field>

                <Field>
                  <FieldLabel htmlFor="profile-email">Email address</FieldLabel>
                  <Input
                    id="profile-email"
                    type="email"
                    value={profile.data.email}
                    disabled
                    readOnly
                  />
                </Field>

                <Field data-invalid={Boolean(profileForm.formState.errors.phone)}>
                  <FieldLabel htmlFor="profile-phone">Phone number</FieldLabel>
                  <Input
                    id="profile-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+91 98765 43210"
                    aria-invalid={Boolean(profileForm.formState.errors.phone)}
                    {...profileForm.register('phone')}
                  />
                  <FieldDescription>
                    Optional. Include the country code when needed.
                  </FieldDescription>
                  <FieldError>{profileForm.formState.errors.phone?.message}</FieldError>
                </Field>

                <Field>
                  <FieldLabel htmlFor="profile-role">Assigned role</FieldLabel>
                  <div className="relative">
                    <ShieldCheck
                      className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="profile-role"
                      className="pl-8"
                      value={formatRoleLabel(profile.data.role)}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                  <FieldDescription>
                    Your role can only be changed by an administrator.
                  </FieldDescription>
                </Field>

                {isProfileUpdated && (
                  <p
                    role="status"
                    className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                  >
                    Profile updated successfully.
                  </p>
                )}

                <Button type="submit" disabled={isUpdatingProfile}>
                  {isUpdatingProfile ? 'Saving…' : 'Save changes'}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound aria-hidden />
              Change password
            </CardTitle>
            <CardDescription>
              Confirm your current password before setting a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitPassword} noValidate>
              <FieldGroup>
                <Field data-invalid={Boolean(passwordForm.formState.errors.currentPassword)}>
                  <FieldLabel htmlFor="current-password">Current password</FieldLabel>
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    aria-invalid={Boolean(passwordForm.formState.errors.currentPassword)}
                    {...passwordForm.register('currentPassword')}
                  />
                  <FieldError>{passwordForm.formState.errors.currentPassword?.message}</FieldError>
                </Field>

                <Field data-invalid={Boolean(passwordForm.formState.errors.newPassword)}>
                  <FieldLabel htmlFor="new-password">New password</FieldLabel>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={Boolean(passwordForm.formState.errors.newPassword)}
                    {...passwordForm.register('newPassword')}
                  />
                  <FieldDescription>
                    Use {PASSWORD_MIN_LENGTH} or more characters, up to {PASSWORD_MAX_BYTES} UTF-8
                    bytes.
                  </FieldDescription>
                  <FieldError>{passwordForm.formState.errors.newPassword?.message}</FieldError>
                </Field>

                {isPasswordChanged && passwordResponse && (
                  <p
                    role="status"
                    className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                  >
                    {passwordResponse.message}.
                  </p>
                )}

                <Button type="submit" disabled={isChangingPassword}>
                  {isChangingPassword ? 'Updating…' : 'Update password'}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
