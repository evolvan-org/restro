'use client';

import {
  completeOnboardingDetailsSchema,
  ONBOARDING_GST_RATES,
  type OnboardingDetailsDraft,
} from '@rms/api-contract';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

import { checkGstin } from '../gst';
import { useOnboarding } from '../OnboardingProvider';
import Shell, { Section } from '../Shell';
import { useStepNavigation } from '../useStepNavigation';
import { issuesByPath } from '../validation';

const CURRENCIES = [
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'AED', label: 'AED — UAE Dirham' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
];

function timezoneLabel(zone: string): string {
  if (zone === 'Asia/Kolkata') return 'Asia/Kolkata (IST, UTC+5:30)';
  return zone.replaceAll('_', ' ');
}

export default function DetailsStep(): ReactElement {
  const { draft, server, setStepData } = useOnboarding();
  const nav = useStepNavigation('details');
  // Problems show once the owner starts editing; the hint below lists what is missing from the start.
  const [edited, setEdited] = useState(false);
  const timezones = useMemo(() => Intl.supportedValuesOf('timeZone'), []);

  const value: OnboardingDetailsDraft = draft.data.details ?? {
    name: server.restaurant.name,
    address: server.restaurant.address ?? '',
    gstNumber: server.restaurant.gstNumber ?? '',
    // A new restaurant starts at 0%; most standalone restaurants charge 5%.
    defaultGstRate: server.restaurant.defaultGstRate || 5,
    maxDiscountPercent: String(server.restaurant.maxDiscountPercent),
    currency: server.restaurant.currency,
    timezone: server.restaurant.timezone,
  };
  const update = (patch: Partial<OnboardingDetailsDraft>): void => {
    setEdited(true);
    setStepData('details', { ...value, ...patch });
  };
  const gstin = checkGstin(value.gstNumber);

  // Recommended step: every field must be filled in (and valid) before continuing or exiting.
  const problems = issuesByPath(completeOnboardingDetailsSchema.safeParse(value).error);
  if (!value.address.trim()) problems.address = 'Address is required';
  if (gstin.status === 'empty') problems.gstNumber = 'GSTIN is required';
  else if (gstin.status === 'invalid') problems.gstNumber = gstin.message;
  const complete = Object.keys(problems).length === 0;
  const errors = edited ? problems : {};
  const FIELD_LABELS: Record<string, string> = {
    name: 'restaurant name',
    address: 'address',
    gstNumber: 'a valid GSTIN',
    defaultGstRate: 'GST rate',
    maxDiscountPercent: 'max discount',
    currency: 'currency',
    timezone: 'time zone',
  };
  const hint = `To continue, fill in: ${Object.keys(problems)
    .map((key) => FIELD_LABELS[key] ?? key)
    .join(', ')}. Or choose Skip for now.`;

  async function onContinue(): Promise<void> {
    if (!complete) return;
    setStepData('details', value);
    await nav.next();
  }

  return (
    <Shell
      step="details"
      title="Restaurant details"
      description="These appear on your bills and GST invoices. Skip for now and we keep your signup name, INR and IST; change any of it later in Restaurant settings."
      complete={complete}
      hint={hint}
      footer={{
        onBack: nav.back,
        onSkip: () => void nav.skip(),
        primary: (
          <Button
            className="h-11 px-5"
            onClick={() => void onContinue()}
            disabled={!complete || nav.busy}
          >
            Save and continue
          </Button>
        ),
      }}
    >
      <Section title="Basics">
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="r-name">
            Restaurant name <span className="text-red-700">*</span>
          </FieldLabel>
          <Input
            id="r-name"
            className="h-11"
            value={value.name}
            aria-invalid={Boolean(errors.name)}
            onChange={(event) => update({ name: event.target.value })}
          />
          {errors.name ? (
            <FieldError>{errors.name}</FieldError>
          ) : (
            <FieldDescription>Filled in from signup</FieldDescription>
          )}
        </Field>
        <Field data-invalid={Boolean(errors.address)}>
          <FieldLabel htmlFor="r-addr">
            Address <span className="font-normal text-neutral-600">· printed on invoices</span>
          </FieldLabel>
          <Textarea
            id="r-addr"
            rows={2}
            value={value.address}
            aria-invalid={Boolean(errors.address)}
            onChange={(event) => update({ address: event.target.value })}
          />
          <FieldError>{errors.address}</FieldError>
        </Field>
      </Section>

      <Section title="Tax & billing">
        <Field data-invalid={Boolean(errors.gstNumber)}>
          <FieldLabel htmlFor="r-gst">
            GSTIN{' '}
            <span className="font-normal text-neutral-600">· needed on your GST invoices</span>
          </FieldLabel>
          <Input
            id="r-gst"
            className="h-11 tracking-wide tabular-nums"
            value={value.gstNumber}
            maxLength={15}
            autoComplete="off"
            aria-invalid={Boolean(errors.gstNumber)}
            aria-describedby="r-gst-status"
            onChange={(event) => update({ gstNumber: event.target.value.toUpperCase() })}
          />
          <span id="r-gst-status" aria-live="polite">
            {gstin.status === 'valid' && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-700">
                <CircleCheck className="size-3.5" aria-hidden />
                Valid format · state code {gstin.stateCode} ({gstin.state})
              </span>
            )}
            {(errors.gstNumber || (gstin.status === 'invalid' && value.gstNumber.length >= 15)) && (
              <span className="flex items-center gap-1.5 text-xs text-red-700">
                <CircleAlert className="size-3.5" aria-hidden />
                {errors.gstNumber ?? (gstin.status === 'invalid' ? gstin.message : '')}
              </span>
            )}
          </span>
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Default GST rate on food</legend>
          <div role="radiogroup" aria-label="Default GST rate" className="flex flex-wrap gap-2">
            {ONBOARDING_GST_RATES.map((rate) => {
              const checked = value.defaultGstRate === rate;
              return (
                <button
                  key={rate}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => update({ defaultGstRate: rate })}
                  className={`h-11 min-w-16 rounded-full border px-4 text-sm transition-colors ${
                    checked
                      ? 'border-neutral-900 bg-neutral-900 font-semibold text-white'
                      : 'border-neutral-300 bg-white font-medium hover:border-neutral-400'
                  }`}
                >
                  {rate}%
                </button>
              );
            })}
          </div>
          <p className="text-xs text-neutral-600">
            Most standalone restaurants charge 5%. You can override it per bill.
          </p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.maxDiscountPercent)}>
            <FieldLabel htmlFor="r-disc">Max discount a manager can give</FieldLabel>
            <div className="relative">
              <Input
                id="r-disc"
                className="h-11 pr-8"
                inputMode="decimal"
                value={value.maxDiscountPercent}
                aria-invalid={Boolean(errors.maxDiscountPercent)}
                onChange={(event) => update({ maxDiscountPercent: event.target.value })}
              />
              <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-neutral-600">
                %
              </span>
            </div>
            <FieldError>{errors.maxDiscountPercent}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.currency)}>
            <FieldLabel htmlFor="r-cur">Currency</FieldLabel>
            <NativeSelect
              className="w-full [&_select]:h-11"
              id="r-cur"
              value={value.currency}
              onChange={(event) => update({ currency: event.target.value })}
            >
              {CURRENCIES.some(({ code }) => code === value.currency) ? null : (
                <option value={value.currency}>{value.currency}</option>
              )}
              {CURRENCIES.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <FieldError>{errors.currency}</FieldError>
          </Field>
        </div>

        <Field data-invalid={Boolean(errors.timezone)}>
          <FieldLabel htmlFor="r-tz">
            Time zone{' '}
            <span className="font-normal text-neutral-600">· used for reports and day close</span>
          </FieldLabel>
          <NativeSelect
            className="w-full [&_select]:h-11"
            id="r-tz"
            value={value.timezone}
            onChange={(event) => update({ timezone: event.target.value })}
          >
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {timezoneLabel(zone)}
              </option>
            ))}
          </NativeSelect>
          <FieldError>{errors.timezone}</FieldError>
        </Field>
      </Section>
    </Shell>
  );
}
