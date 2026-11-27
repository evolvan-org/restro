/**
 * @rms/api-contract — the shared contract between API and web.
 * Zod schemas are the single source of truth; TypeScript types are inferred
 * from them so the client and server can never drift.
 */

export * from './common';
export * from './notifications';
export * from './dining-sections';
export * from './status';
export * from './auth';
export * from './profile';
export * from './roles';
export * from './staff';
export * from './tables';
export * from './user-fields';
export * from './table-statuses';
export * from './restaurant-settings';
export * from './reservations';
export * from './menu-categories';
export * from './stock-items';
export * from './inventory';
export * from './menu-items';
export * from './serving-types';
export * from './orders';
export * from './bills';
export * from './bill-cancellation-reasons';
export * from './bill-summary';
export * from './dashboard';
export * from './reports';
export * from './onboarding';
export * from './ai-scans';
export * from './costing';
export * from './ingredient-matching';
export * from './margins';
export * from './qr-ordering';
