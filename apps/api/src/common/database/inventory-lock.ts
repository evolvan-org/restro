import type { Prisma } from '@rms/db';

/** Upper bound for an inventory writer's transaction (CSV imports are the slowest holders). */
export const INVENTORY_WRITE_TIMEOUT_MS = 15_000;

/**
 * Timeout for transactions that only need the lock briefly (e.g. recipe validation): long enough to
 * wait out a full inventory write and still finish, instead of hitting Prisma's 5s default.
 */
export const INVENTORY_LOCK_WAITER_TIMEOUT_MS = INVENTORY_WRITE_TIMEOUT_MS + 5_000;

/** Serializes inventory writers in one restaurant while leaving other restaurants independent. */
export async function lockRestaurantInventory(
  tx: Prisma.TransactionClient,
  restaurantId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'inventory:' + restaurantId}, 0))`;
}
