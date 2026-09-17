/**
 * @rms/api-contract — the shared contract between API and web.
 * Zod schemas are the single source of truth; TypeScript types are inferred
 * from them so the client and server can never drift.
 */

export * from './common';
export * from './status';
