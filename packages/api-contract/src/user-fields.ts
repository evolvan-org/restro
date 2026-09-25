import { z } from 'zod';

/**
 * Field rules for a user's editable contact details, shared by the profile (self-service)
 * and staff account (admin) forms so the two can't drift.
 */

export const userNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(255, 'Name is too long');

export const userEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(255, 'Email address is too long');

export const userPhoneSchema = z
  .string()
  .trim()
  .max(30, 'Phone number must be 30 characters or fewer')
  .regex(
    /^\+?[0-9().\-\s]*$/,
    'Phone number may only contain digits, spaces, +, -, parentheses, and periods',
  )
  .refine(
    (value) => value.length === 0 || value.replace(/\D/g, '').length >= 10,
    'Phone number must contain at least 10 digits',
  )
  .nullable()
  .describe('Optional; when non-empty, must contain at least 10 digits');
