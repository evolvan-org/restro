import { type KotDestination, Prisma } from '@rms/db';

type DatabaseClient = Prisma.TransactionClient;

export type KotGroup = {
  destination: KotDestination;
  items: {
    orderItemId: string;
    quantity: number;
    componentMenuItemId?: string | null;
    nameSnapshot?: string | null;
    instructionsSnapshot?: string | null;
  }[];
};

/**
 * Creates one KOT per destination group with the next restaurant-wide `KOT-000123` numbers.
 * Serializes the human-readable sequence on the restaurant row (no counter table); the
 * `(restaurant_id, kot_number)` unique constraint remains the backstop. Call inside a transaction.
 */
export async function createKotTickets<TSelect extends Prisma.KotSelect>(
  tx: DatabaseClient,
  input: {
    restaurantId: string;
    orderId: string;
    createdByUserId: string;
    groups: readonly KotGroup[];
    select: TSelect;
    /** QR tickets carry their round and approver ("QR · approved by …"). */
    qr?: { roundId: string; approvedByUserId: string };
  },
): Promise<Prisma.KotGetPayload<{ select: TSelect }>[]> {
  const { restaurantId, orderId, createdByUserId, groups, select, qr } = input;
  await tx.$queryRaw`SELECT id FROM restaurants WHERE id = ${restaurantId}::uuid FOR UPDATE`;
  const rows = await tx.$queryRaw<{ currentNumber: bigint }[]>`
    SELECT COALESCE(MAX(SUBSTRING(kot_number FROM 5)::bigint), 0) AS "currentNumber"
    FROM kots
    WHERE restaurant_id = ${restaurantId}::uuid
      AND kot_number ~ '^KOT-[0-9]+$'
  `;
  const firstNumber = Number(rows[0]?.currentNumber ?? 0n) + 1;
  const sentAt = new Date();
  return Promise.all(
    groups.map(
      (group, index) =>
        tx.kot.create({
          data: {
            restaurantId,
            orderId,
            createdByUserId,
            kotNumber: `KOT-${String(firstNumber + index).padStart(6, '0')}`,
            destination: group.destination,
            status: 'PENDING',
            createdAt: sentAt,
            ...(qr && {
              source: 'QR' as const,
              qrRoundId: qr.roundId,
              approvedByUserId: qr.approvedByUserId,
            }),
            items: {
              create: group.items.map((item) => ({ ...item, status: 'PENDING' as const })),
            },
            preparationEvents: {
              create: {
                restaurantId,
                recordedByUserId: createdByUserId,
                action: 'SENT',
                status: 'PENDING',
                version: 0,
                isPriority: false,
                createdAt: sentAt,
              },
            },
          },
          select,
        }) as unknown as Promise<Prisma.KotGetPayload<{ select: TSelect }>>,
    ),
  );
}

/** Splits lines into Kitchen (FOOD) and Bar (BAR) groups, dropping empty groups. */
export function groupByDestination(
  lines: readonly { orderItemId: string; quantity: number; itemType: 'FOOD' | 'BAR' }[],
): KotGroup[] {
  const kitchen = lines.filter((line) => line.itemType === 'FOOD');
  const bar = lines.filter((line) => line.itemType === 'BAR');
  const strip = (items: typeof lines): KotGroup['items'] =>
    items.map(({ orderItemId, quantity }) => ({ orderItemId, quantity }));
  return [
    ...(kitchen.length ? [{ destination: 'KITCHEN' as const, items: strip(kitchen) }] : []),
    ...(bar.length ? [{ destination: 'BAR' as const, items: strip(bar) }] : []),
  ];
}
