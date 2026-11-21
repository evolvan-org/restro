import { z } from 'zod';

import { onboardingStateSchema } from './auth';
import {
  PASSWORD_MAX_BYTES,
  userNameSchema,
  userPasswordSchema,
  userPhoneSchema,
} from './user-fields';

const passwordWithinBcryptLimit = (value: string): boolean =>
  new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES;

export const profileResponseSchema = z
  .object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string().nullable(),
    role: z.string().min(1),
    /** Effective permission keys: from the role's grants, or every key for the Owner. */
    permissions: z.array(z.string()),
    emailVerifiedAt: z.string().datetime().nullable(),
    onboarding: onboardingStateSchema,
    mustChangePassword: z.boolean(),
  })
  .strict();

export const updateProfileRequestSchema = z
  .object({
    name: userNameSchema,
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
    newPassword: userPasswordSchema,
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
