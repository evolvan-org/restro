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
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  WEB_ORIGIN: z.string().optional(),

  // ----- AI assistance (REST-89) -----
  /** `fake` returns canned rows with delays: dev, CI, tests and offline demos. */
  AI_PROVIDER: z.enum(['gemini', 'fake']).optional(),
  /** Without a key (and with the gemini provider) AI features report AI_UNAVAILABLE. */
  GEMINI_API_KEY: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  AI_MODEL_MENU: z.string().min(1).default('gemini-2.5-flash-lite'),
  AI_MODEL_INVOICE: z.string().min(1).default('gemini-2.5-flash'),
  AI_MODEL_RECIPES: z.string().min(1).default('gemini-2.5-flash-lite'),
  AI_UPLOAD_DIR: z.string().min(1).default('./data/ai-uploads'),
  AI_IMAGE_TTL_HOURS: z.coerce.number().int().positive().default(72),
  AI_DAILY_MENU_SCANS: z.coerce.number().int().nonnegative().default(10),
  AI_DAILY_INVOICE_SCANS: z.coerce.number().int().nonnegative().default(20),
  AI_MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().max(20).default(3),
  AI_PRICE_JUMP_PERCENT: z.coerce.number().positive().default(15),
  /** Fake provider only: force a failure state (`unreadable`, `partial`, `unavailable`). */
  AI_FAKE_SCENARIO: z.enum(['ok', 'unreadable', 'partial', 'unavailable']).default('ok'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
