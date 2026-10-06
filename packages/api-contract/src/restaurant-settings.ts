import { z } from 'zod';

export const GST_NUMBER_MAX_LENGTH = 50;
export const GST_RATE_MIN = 0;
export const GST_RATE_MAX = 100;

const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The database column is Decimal(5,2), so at most two decimal places are stored. */
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Restaurant name is required')
  .max(255, 'Restaurant name must be 255 characters or fewer');

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(
    (code) => SUPPORTED_CURRENCIES.has(code),
    'Enter a valid ISO 4217 currency code, e.g. INR',
  )
  .describe('ISO 4217 currency code; normalized to uppercase');

const timezoneSchema = z
  .string()
  .trim()
  .min(1, 'Timezone is required')
  .max(100, 'Timezone must be 100 characters or fewer')
  .refine(isValidTimezone, 'Enter a valid IANA timezone, e.g. Asia/Kolkata');

const gstRateSchema = z
  .number({ invalid_type_error: 'GST rate must be a number' })
  .min(GST_RATE_MIN, `GST rate must be between ${GST_RATE_MIN} and ${GST_RATE_MAX}`)
  .max(GST_RATE_MAX, `GST rate must be between ${GST_RATE_MIN} and ${GST_RATE_MAX}`)
  .refine(hasAtMostTwoDecimals, 'GST rate can have at most 2 decimal places')
  .describe('Default GST rate in percent (0-100, up to 2 decimal places)');

export const restaurantSettingsSchema = z
  .object({
    name: nameSchema,
    currency: currencySchema,
    timezone: timezoneSchema,
    gstNumber: z
      .string()
      .trim()
      .max(GST_NUMBER_MAX_LENGTH, `GST number must be ${GST_NUMBER_MAX_LENGTH} characters or fewer`)
      .nullable()
      .transform((value) => value || null)
      .describe('Optional tax identifier; an empty value clears it'),
    defaultGstRate: gstRateSchema,
  })
  .strict();

export const updateRestaurantSettingsRequestSchema = restaurantSettingsSchema;

export const restaurantSettingsResponseSchema = z
  .object({
    name: z.string(),
    currency: z.string(),
    timezone: z.string(),
    gstNumber: z.string().nullable(),
    defaultGstRate: z.number(),
  })
  .strict();

export type UpdateRestaurantSettingsRequest = z.infer<typeof updateRestaurantSettingsRequestSchema>;
export type RestaurantSettingsResponse = z.infer<typeof restaurantSettingsResponseSchema>;
