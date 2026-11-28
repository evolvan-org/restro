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
export * from './menu-history';
export * from './menu-customizations';
export * from './serving-types';
export * from './orders';
export * from './order-selections';
export * from './bills';
export * from './bill-cancellation-reasons';
export * from './bill-summary';
export * from './dashboard';
export * from './reports';
export * from './onboarding';
export * from './qr-ordering';
export * from './qr-feedback';

export * from './preparation';

export * from './operating-tasks';

export * from './authenticator';
export * from './thermal-printing';
