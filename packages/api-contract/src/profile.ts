import { z } from 'zod';
import { userEmailSchema, userNameSchema, userPhoneSchema } from './user-fields';

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
    name: userNameSchema,
    email: userEmailSchema,
    phone: userPhoneSchema,
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
