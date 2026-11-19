import type { Prisma } from '@rms/db';

/** Serializes inventory writers in one restaurant while leaving other restaurants independent. */
export async function lockRestaurantInventory(
  tx: Prisma.TransactionClient,
  restaurantId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'inventory:' + restaurantId}, 0))`;
}
