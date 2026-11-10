import { PrismaClient } from '@prisma/client';

export const BILL_CANCELLATION_REASONS = [
  { code: 'GUEST_REQUEST', name: 'Guest request' },
  { code: 'DUPLICATE_BILL', name: 'Duplicate bill' },
  { code: 'BILLING_ERROR', name: 'Billing error' },
  { code: 'ORDER_CHANGED', name: 'Order changed' },
  { code: 'OTHER', name: 'Other' },
] as const;

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
  void main().catch(() => {
    console.error(
      'Unable to seed bill cancellation reasons. Check database access and migrations.',
    );
    process.exitCode = 1;
  });
}
