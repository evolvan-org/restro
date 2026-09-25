import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

const passwordWithinBcryptLimit = (value: string): boolean =>
  new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES;

export const profileResponseSchema = z
  .object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string().nullable(),
    role: z.string().min(1),
  })
  .strict();

export const updateProfileRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(255, 'Name is too long'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Enter a valid email address')
      .max(255, 'Email address is too long'),
    phone: z
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
      .describe('Optional; when non-empty, must contain at least 10 digits'),
  })
  .strict();

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Current password is required')
      .refine(passwordWithinBcryptLimit, 'Current password must be 72 bytes or fewer')
      .describe(`At most ${PASSWORD_MAX_BYTES} UTF-8 bytes`),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `New password must be at least ${PASSWORD_MIN_LENGTH} characters`)
      .refine(passwordWithinBcryptLimit, 'New password must be 72 bytes or fewer')
      .describe(`${PASSWORD_MIN_LENGTH}+ characters, at most ${PASSWORD_MAX_BYTES} UTF-8 bytes`),
  })
  .strict();

export const changePasswordResponseSchema = z
  .object({
    message: z.string(),
  })
  .strict();

export type ProfileResponse = z.infer<typeof profileResponseSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type ChangePasswordResponse = z.infer<typeof changePasswordResponseSchema>;
