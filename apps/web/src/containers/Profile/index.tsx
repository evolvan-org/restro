'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  changePasswordRequestSchema,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  updateProfileRequestSchema,
  type ChangePasswordRequest,
  type UpdateProfileRequest,
} from '@rms/api-contract';
import { KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/lib/api-error';
import { useChangePassword, useProfile, useUpdateProfile } from '@/services/api/requests/profile';

type Notice = { kind: 'success' | 'error'; message: string } | null;

function NoticeMessage({ notice }: { notice: Notice }): ReactElement | null {
  if (!notice) {
    return null;
  }

  const isError = notice.kind === 'error';
  return (
    <p
      className={
        isError
          ? 'rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'
          : 'rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
      }
      role={isError ? 'alert' : 'status'}
    >
      {notice.message}
    </p>
  );
}

export default function Profile(): ReactElement {
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const [profileNotice, setProfileNotice] = useState<Notice>(null);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);

  const profileForm = useForm<UpdateProfileRequest>({
    resolver: zodResolver(updateProfileRequestSchema),
    defaultValues: {
      name: '',
      email: '',
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
        email: profile.data.email,
        phone: profile.data.phone ?? '',
      });
    }
  }, [profile.data, profileForm]);

  const submitProfile = profileForm.handleSubmit(async (values) => {
    setProfileNotice(null);

    try {
      const updated = await updateProfile.mutateAsync({
        name: values.name,
        email: values.email,
        phone: values.phone || null,
      });
      profileForm.reset({
        name: updated.name,
        email: updated.email,
        phone: updated.phone ?? '',
      });
      setProfileNotice({ kind: 'success', message: 'Profile updated successfully.' });
    } catch (error) {
      setProfileNotice({
        kind: 'error',
        message: getApiErrorMessage(error, 'Unable to update the profile.'),
      });
    }
  });

  const submitPassword = passwordForm.handleSubmit(async (values) => {
    setPasswordNotice(null);

    try {
      const response = await changePassword.mutateAsync(values);
      passwordForm.reset();
      setPasswordNotice({ kind: 'success', message: `${response.message}.` });
    } catch (error) {
      setPasswordNotice({
        kind: 'error',
        message: getApiErrorMessage(error, 'Unable to change the password.'),
      });
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
            {getApiErrorMessage(profile.error, 'Unable to load your profile.')}
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

                <Field data-invalid={Boolean(profileForm.formState.errors.email)}>
                  <FieldLabel htmlFor="profile-email">Email address</FieldLabel>
                  <Input
                    id="profile-email"
                    type="email"
                    autoComplete="email"
                    aria-invalid={Boolean(profileForm.formState.errors.email)}
                    {...profileForm.register('email')}
                  />
                  <FieldError>{profileForm.formState.errors.email?.message}</FieldError>
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
                      value={profile.data.role}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                  <FieldDescription>
                    Your role can only be changed by an administrator.
                  </FieldDescription>
                </Field>

                <NoticeMessage notice={profileNotice} />

                <Button type="submit" disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? 'Saving…' : 'Save changes'}
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

                <NoticeMessage notice={passwordNotice} />

                <Button type="submit" disabled={changePassword.isPending}>
                  {changePassword.isPending ? 'Updating…' : 'Update password'}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
