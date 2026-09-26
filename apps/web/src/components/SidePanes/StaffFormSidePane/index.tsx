'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateStaffRequest,
  createStaffRequestSchema,
  type StaffAccount,
} from '@rms/api-contract';
import { type ReactElement, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getApiErrorMessage } from '@/lib/api-error';
import { useProfile } from '@/services/api/requests/profile';
import { useCreateStaff, useStaffRoles, useUpdateStaff } from '@/services/api/requests/staff';
import { useShowStaffTemporaryPasswordModal } from '@/store/hooks/modal';
import { useHideSidePane } from '@/store/hooks/sidepane';

/** Props come from `useShowStaffFormSidePane()(account?)`, plus `onCancel`. */
export type StaffFormSidePaneProps = {
  /** The account to edit; omit to create a new one. */
  account?: StaffAccount;
  onCancel?: () => void;
};

const FORM_ID = 'staff-form';

/** Create or edit a staff account. Creating one shows its temporary password afterwards. */
export default function StaffFormSidePane({
  account,
  onCancel,
}: StaffFormSidePaneProps): ReactElement {
  const isEdit = account !== undefined;
  const { data: profile } = useProfile();
  // The API rejects changing your own role, so the field is read-only for yourself.
  const isSelf = isEdit && profile?.email === account.email;

  const roles = useStaffRoles(true);
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const hideSidePane = useHideSidePane();
  const showTemporaryPassword = useShowStaffTemporaryPasswordModal();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<CreateStaffRequest>({
    resolver: zodResolver(createStaffRequestSchema),
    defaultValues: {
      name: account?.name ?? '',
      email: account?.email ?? '',
      phone: account?.phone ?? '',
      roleId: account?.role.id ?? '',
    },
  });
  const { errors } = form.formState;

  const roleOptions = [...(roles.data ?? [])];
  if (account && !roleOptions.some((role) => role.id === account.role.id)) {
    roleOptions.push(account.role);
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);

    try {
      if (account) {
        await updateStaff.mutateAsync({ id: account.id, input: values });
        hideSidePane();
      } else {
        const created = await createStaff.mutateAsync(values);
        hideSidePane();
        showTemporaryPassword(created);
      }
    } catch (error) {
      setSubmitError(
        getApiErrorMessage(
          error,
          isEdit ? 'Unable to update the staff account.' : 'Unable to create the staff account.',
        ),
      );
    }
  });

  const isSaving = createStaff.isPending || updateStaff.isPending;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{isEdit ? 'Edit staff account' : 'Add staff account'}</SheetTitle>
        <SheetDescription>
          {isEdit
            ? 'Update the account details and role.'
            : 'A temporary password is generated when you create the account.'}
        </SheetDescription>
      </SheetHeader>

      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex-1 overflow-y-auto px-4">
        <FieldGroup>
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="staff-name">Name</FieldLabel>
            <Input
              id="staff-name"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              {...form.register('name')}
            />
            <FieldError>{errors.name?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="staff-email">Email address</FieldLabel>
            <Input
              id="staff-email"
              type="email"
              autoComplete="off"
              aria-invalid={Boolean(errors.email)}
              {...form.register('email')}
            />
            <FieldDescription>Used to log in; must be unique in your restaurant.</FieldDescription>
            <FieldError>{errors.email?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.phone)}>
            <FieldLabel htmlFor="staff-phone">Phone number</FieldLabel>
            <Input
              id="staff-phone"
              type="tel"
              autoComplete="off"
              placeholder="+91 98765 43210"
              aria-invalid={Boolean(errors.phone)}
              {...form.register('phone')}
            />
            <FieldDescription>Optional. Include the country code when needed.</FieldDescription>
            <FieldError>{errors.phone?.message}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.roleId)}>
            <FieldLabel htmlFor="staff-role">Role</FieldLabel>
            {isSelf ? (
              <>
                <Input id="staff-role" value={account.role.name} readOnly aria-readonly="true" />
                <FieldDescription>You can&apos;t change your own role.</FieldDescription>
              </>
            ) : (
              <>
                <NativeSelect
                  id="staff-role"
                  className="w-full"
                  disabled={roles.isPending}
                  aria-invalid={Boolean(errors.roleId)}
                  {...form.register('roleId')}
                >
                  <NativeSelectOption value="" disabled>
                    {roles.isPending ? 'Loading roles…' : 'Select a role'}
                  </NativeSelectOption>
                  {roleOptions.map((role) => (
                    <NativeSelectOption key={role.id} value={role.id}>
                      {role.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {roles.isError ? (
                  <FieldDescription>Unable to load roles. Close and try again.</FieldDescription>
                ) : null}
              </>
            )}
            <FieldError>{errors.roleId?.message}</FieldError>
          </Field>

          {submitError ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {submitError}
            </p>
          ) : null}
        </FieldGroup>
      </form>

      <SheetFooter>
        <Button type="submit" form={FORM_ID} disabled={isSaving}>
          {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Create account'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </SheetFooter>
    </>
  );
}
