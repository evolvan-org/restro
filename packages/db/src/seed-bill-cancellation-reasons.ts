import { PrismaClient } from '@prisma/client';

import { BILL_CANCELLATION_REASONS } from './tenant-defaults';

/** Add missing defaults for each restaurant without overwriting existing catalog entries. */
export async function seedBillCancellationReasons(
  prisma: PrismaClient,
): Promise<{ restaurants: number; created: number }> {
  const restaurants = await prisma.restaurant.findMany({ select: { id: true } });
  let created = 0;
  for (const restaurant of restaurants) {
    const result = await prisma.billCancellationReason.createMany({
      data: BILL_CANCELLATION_REASONS.map((reason, sortOrder) => ({
        ...reason,
        restaurantId: restaurant.id,
        sortOrder,
      })),
      skipDuplicates: true,
    });
    created += result.count;
  }
  return { restaurants: restaurants.length, created };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await seedBillCancellationReasons(prisma);
    console.log(
      `Added ${result.created} bill cancellation reason(s) across ${result.restaurants} restaurant(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(
      'Unable to seed bill cancellation reasons. Check database access and migrations.',
      error,
    );
    process.exitCode = 1;
  });
}
