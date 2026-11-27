import { z } from 'zod';

export const authenticatorCodeSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\d{6}|[a-f0-9]{5}(?:-?[a-f0-9]{5}){3})$/i,
    'Enter your six-digit authenticator code or a recovery code',
  );
export const authenticatorPasswordSchema = z
  .object({
    password: z.string().min(1).max(1024),
  })
  .strict();
export const authenticatorEnableSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
  })
  .strict();
export const authenticatorDisableSchema = authenticatorPasswordSchema.extend({
  code: authenticatorCodeSchema,
});
export const authenticatorStatusSchema = z
  .object({ enabled: z.boolean(), recoveryCodesRemaining: z.number().int().nonnegative() })
  .strict();
export const authenticatorSetupSchema = z
  .object({ uri: z.string(), secret: z.string(), expiresAt: z.string().datetime() })
  .strict();
export const authenticatorEnabledSchema = z
  .object({ recoveryCodes: z.array(z.string()), accessToken: z.string() })
  .strict();
export const authenticatorDisabledSchema = z
  .object({ message: z.string(), accessToken: z.string() })
  .strict();
