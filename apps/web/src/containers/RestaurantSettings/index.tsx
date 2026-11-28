'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  GST_NUMBER_MAX_LENGTH,
  GST_RATE_MAX,
  GST_RATE_MIN,
  type RestaurantSettingsResponse,
  type UpdateRestaurantSettingsRequest,
  updateRestaurantSettingsRequestSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { Store } from 'lucide-react';
import { type ReactElement, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import usePermissions from '@/hooks/auth/usePermissions';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  useRestaurantSettings,
  useUpdateRestaurantSettings,
} from '@/services/api/requests/restaurant-settings';

import BillCancellationReasons from './BillCancellationReasons';

function toFormValues(settings: RestaurantSettingsResponse): UpdateRestaurantSettingsRequest {
  return { ...settings, gstNumber: settings.gstNumber ?? '', address: settings.address ?? '' };
}

import LogoSettings from './LogoSettings';

function useCurrencyOptions(selected: string): { code: string; label: string }[] {
  return useMemo(() => {
    const names = new Intl.DisplayNames('en', { type: 'currency' });
    // `selected` is '' until the settings load; `DisplayNames.of` throws on a malformed code.
    const codes = new Set([...Intl.supportedValuesOf('currency'), ...(selected ? [selected] : [])]);
    return [...codes].sort().map((code) => {
      try {
        return { code, label: `${code} — ${names.of(code) ?? code}` };
      } catch {
        return { code, label: code };
      }
    });
  }, [selected]);
}

function useTimezoneOptions(selected: string): string[] {
  return useMemo(
    () =>
      [...new Set([...Intl.supportedValuesOf('timeZone'), ...(selected ? [selected] : [])])].sort(),
    [selected],
  );
}

export default function RestaurantSettings({
  view = 'all',
  embedded = false,
}: {
  view?: 'general' | 'tax' | 'all';
  embedded?: boolean;
} = {}): ReactElement {
  const settings = useRestaurantSettings();
  const updateSettings = useUpdateRestaurantSettings();
  const { can } = usePermissions();
  const canRead = can(Permission.SETTINGS_READ);
  const canEdit = can(Permission.RESTAURANT_WRITE);

  const form = useForm<UpdateRestaurantSettingsRequest>({
    resolver: zodResolver(updateRestaurantSettingsRequestSchema),
    defaultValues: {
      name: '',
      currency: '',
      timezone: '',
      gstNumber: '',
      defaultGstRate: 0,
      address: '',
      maxDiscountPercent: 20,
    },
  });
  const { errors, isDirty } = form.formState;

  const currencyOptions = useCurrencyOptions(settings.data?.currency ?? '');
  const timezoneOptions = useTimezoneOptions(settings.data?.timezone ?? '');

  useEffect(() => {
    if (settings.data) {
      form.reset(toFormValues(settings.data));
    }
  }, [settings.data, form]);

  const submit = form.handleSubmit(async (values) => {
    try {
      await updateSettings.mutateAsync(values);
      form.reset(values);
    } catch {
      // The request hook reports API failures; retain the settings form.
    }
  });

  if (settings.isPending) {
    return (
      <div
        className={
          embedded
            ? 'flex items-center justify-center py-20'
            : 'mx-auto flex max-w-6xl items-center justify-center px-6 py-24'
        }
      >
        <p className="text-sm text-muted-foreground">Loading restaurant settings…</p>
      </div>
    );
  }

  if (settings.isError) {
    return (
      <div
        className={
          embedded
            ? 'flex items-center justify-center py-20'
            : 'mx-auto flex max-w-6xl items-center justify-center px-6 py-24'
        }
      >
        <div className="space-y-4 text-center">
          <p role="alert" className="text-sm text-destructive">
            {getApiErrorMessage(settings.error, 'Unable to load the restaurant settings.')}
          </p>
          <Button type="button" variant="outline" onClick={() => settings.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const showGeneral = view === 'all' || view === 'general';
  const showTax = view === 'all' || view === 'tax';

  return (
    <div className={embedded ? 'w-full' : 'mx-auto w-full max-w-6xl px-6 py-10 sm:py-14'}>
      {embedded ? (
        <div className="mb-6">
          <h2 className="text-xl font-bold tracking-tight">
            {view === 'tax' ? 'Tax & discounts' : 'General settings'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === 'tax'
              ? 'Configure GST details, default tax rate, and maximum discount limits.'
              : 'Manage your restaurant identity, regional options, and address.'}
          </p>
        </div>
      ) : (
        <div className="mb-8">
          <p className="text-sm font-medium text-muted-foreground">Restaurant</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Restaurant settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage Basic Restaurant Settings</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store aria-hidden />
            {view === 'tax' ? 'Tax & discount rules' : 'Basic settings'}
          </CardTitle>
          <CardDescription>
            {canEdit
              ? view === 'tax'
                ? 'Update tax rate and discount ceiling rules.'
                : 'Update your restaurant identity, regional and address settings.'
              : 'You can view these settings but only a manager or owner can change them.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} noValidate>
            <FieldGroup>
              {showGeneral && (
                <>
                  <Field data-invalid={Boolean(errors.name)}>
                    <FieldLabel htmlFor="restaurant-name">Restaurant name</FieldLabel>
                    <Input
                      id="restaurant-name"
                      disabled={!canEdit}
                      aria-invalid={Boolean(errors.name)}
                      {...form.register('name')}
                    />
                    <FieldError>{errors.name?.message}</FieldError>
                  </Field>

                  <Field data-invalid={Boolean(errors.currency)}>
                    <FieldLabel htmlFor="restaurant-currency">Currency</FieldLabel>
                    <NativeSelect
                      id="restaurant-currency"
                      className="w-full"
                      disabled={!canEdit}
                      aria-invalid={Boolean(errors.currency)}
                      {...form.register('currency')}
                    >
                      {currencyOptions.map(({ code, label }) => (
                        <NativeSelectOption key={code} value={code}>
                          {label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldError>{errors.currency?.message}</FieldError>
                  </Field>

                  <Field data-invalid={Boolean(errors.timezone)}>
                    <FieldLabel htmlFor="restaurant-timezone">Timezone</FieldLabel>
                    <NativeSelect
                      id="restaurant-timezone"
                      className="w-full"
                      disabled={!canEdit}
                      aria-invalid={Boolean(errors.timezone)}
                      {...form.register('timezone')}
                    >
                      {timezoneOptions.map((timezone) => (
                        <NativeSelectOption key={timezone} value={timezone}>
                          {timezone}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldError>{errors.timezone?.message}</FieldError>
                  </Field>

                  <Field data-invalid={Boolean(errors.address)}>
                    <FieldLabel htmlFor="restaurant-address">
                      Restaurant address (optional)
                    </FieldLabel>
                    <Input
                      id="restaurant-address"
                      maxLength={500}
                      disabled={!canEdit}
                      aria-invalid={Boolean(errors.address)}
                      {...form.register('address')}
                    />
                    <FieldError>{errors.address?.message}</FieldError>
                  </Field>
                </>
              )}

              {showTax && (
                <>
                  <Field data-invalid={Boolean(errors.gstNumber)}>
                    <FieldLabel htmlFor="restaurant-gst-number">GST number</FieldLabel>
                    <Input
                      id="restaurant-gst-number"
                      maxLength={GST_NUMBER_MAX_LENGTH}
                      disabled={!canEdit}
                      aria-invalid={Boolean(errors.gstNumber)}
                      {...form.register('gstNumber')}
                    />
                    <FieldDescription>Optional. Leave empty to clear it.</FieldDescription>
                    <FieldError>{errors.gstNumber?.message}</FieldError>
                  </Field>

                  <Field data-invalid={Boolean(errors.defaultGstRate)}>
                    <FieldLabel htmlFor="restaurant-gst-rate">Default GST rate (%)</FieldLabel>
                    <Input
                      id="restaurant-gst-rate"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={GST_RATE_MIN}
                      max={GST_RATE_MAX}
                      disabled={!canEdit}
                      aria-invalid={Boolean(errors.defaultGstRate)}
                      {...form.register('defaultGstRate', { valueAsNumber: true })}
                    />
                    <FieldDescription>
                      Applied to bills by default. Between {GST_RATE_MIN} and {GST_RATE_MAX}, up to
                      2 decimal places.
                    </FieldDescription>
                    <FieldError>{errors.defaultGstRate?.message}</FieldError>
                  </Field>

                  <Field data-invalid={Boolean(errors.maxDiscountPercent)}>
                    <FieldLabel htmlFor="restaurant-discount-cap">
                      Maximum bill discount (%)
                    </FieldLabel>
                    <Input
                      id="restaurant-discount-cap"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="0.01"
                      disabled={!canEdit}
                      aria-invalid={Boolean(errors.maxDiscountPercent)}
                      {...form.register('maxDiscountPercent', { valueAsNumber: true })}
                    />
                    <FieldDescription>
                      Maximum discount as a percentage of subtotal. Applies to amount and percentage
                      discounts.
                    </FieldDescription>
                    <FieldError>{errors.maxDiscountPercent?.message}</FieldError>
                  </Field>
                </>
              )}

              {canEdit && (
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={!isDirty || updateSettings.isPending}>
                    {updateSettings.isPending ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              )}
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      {showGeneral && <LogoSettings />}
      {view === 'all' && canRead && <BillCancellationReasons canEdit={canEdit} />}
    </div>
  );
}
