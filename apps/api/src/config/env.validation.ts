import { z } from 'zod';

/** Validated environment schema. Fails fast on boot if misconfigured. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(1),
  RATE_LIMIT_HASH_SECRET: z.string().min(16),
  EMAIL_PROVIDER_API_KEY: z.string().min(1),
  EMAIL_FROM_ADDRESS: z.string().email(),
  EMAIL_FROM_NAME: z.string().trim().min(1).max(255),
  EMAIL_TEMPLATE_VERIFY_EMAIL_ID: z.coerce.number().int().positive(),
  EMAIL_TEMPLATE_RESET_PASSWORD_ID: z.coerce.number().int().positive(),
  EMAIL_TEMPLATE_STAFF_INVITE_ID: z.coerce.number().int().positive(),
  APP_PUBLIC_URL: z.string().url(),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  PUSHER_APP_ID: z.string().min(1),
  PUSHER_KEY: z.string().min(1),
  PUSHER_SECRET: z.string().min(1),
  PUSHER_CLUSTER: z.string().regex(/^[a-z0-9-]+$/),
  /** Web Push (VAPID). All three unset disables push; the in-app alerts still work. */
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:|https:\/\/)/, 'VAPID_SUBJECT must be a mailto: or https:// URL')
    .optional(),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  WEB_ORIGIN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const VAPID_KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema
    .refine((env) => VAPID_KEYS.every((key) => env[key]) || VAPID_KEYS.every((key) => !env[key]), {
      message: 'Set all of VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT, or none',
    })
    .safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
