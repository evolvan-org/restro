import { PrismaClient, type Prisma } from '@prisma/client';

import { seedInventoryActivity, seedStockItems, seedSuppliers } from './inventory';
import { seedMenu } from './menu';
import { seedServiceHistory, type SeedTable, type SeedUser } from './service-history';
import type { Tx } from './support';
import { DEFAULT_SEED, type YearOptions, yearChunks } from './year-config';
import { analyzeYearSeed, validateYearSeed } from './year-validation';

type Checkpoint = {
  restaurantId: string;
  seed: number;
  anchor: Date;
  nextChunk: number;
  done: boolean;
};
type Setup = {
  restaurantId: string;
  users: SeedUser[];
  statusIds: ReadonlyMap<string, string>;
  billing: { gstRate: Prisma.Decimal; maxDiscountPercent: Prisma.Decimal };
};

export async function withRestaurantSeedLock(run: () => Promise<void>): Promise<void> {
  // Keep the lease on a dedicated connection while the main client commits each chunk.
  const lease = new PrismaClient();
  try {
    await lease.$transaction(
      async (tx) => {
        const [result] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended('rms:restaurant-seed', 0)) AS locked`;
        if (!result?.locked)
          throw new Error('A restaurant seed is already running on this database');
        await run();
      },
      { timeout: 30 * 60_000 },
    );
  } finally {
    await lease.$disconnect();
  }
}

export async function readCheckpoint(db: Tx): Promise<Checkpoint | undefined> {
  const [table] = await db.$queryRaw<{ present: boolean }[]>`
    SELECT to_regclass('rms_seed.restaurant_history') IS NOT NULL AS present`;
  if (!table?.present) return undefined;
  const [row] = await db.$queryRaw<Checkpoint[]>`
    SELECT restaurant_id::text AS "restaurantId", seed::float8 AS seed, anchor,
      next_chunk AS "nextChunk", done FROM rms_seed.restaurant_history WHERE singleton`;
  return row;
}

export async function assertLegacySeedAllowed(db: Tx): Promise<void> {
  const state = await readCheckpoint(db);
  if (state && !state.done)
    throw new Error('Year seed is incomplete. Resume with seed:restaurant --months 12.');
}

export async function runYearSeed(
  prisma: PrismaClient,
  options: YearOptions,
  helpers: {
    setupRestaurant: (tx: Tx) => Promise<Setup>;
    loadTables: (tx: Tx, restaurantId: string) => Promise<SeedTable[]>;
  },
  transactionOptions: { timeout: number; maxWait: number },
): Promise<void> {
  const startedAt = Date.now();
  const existing = await readCheckpoint(prisma);
  if (
    existing &&
    ((options.seed !== undefined && options.seed !== existing.seed) ||
      (options.now && options.now.getTime() !== existing.anchor.getTime()))
  )
    throw new Error(
      'Seed or clock differs from the saved year run. Use its original options or a fresh database.',
    );

  const seed = existing?.seed ?? options.seed ?? DEFAULT_SEED;
  const anchor = existing?.anchor ?? options.now ?? new Date();
  const chunks = yearChunks(anchor);
  if (existing?.done) {
    console.log('12-month restaurant seed already complete.');
    await analyzeYearSeed(prisma);
    console.table(await validateYearSeed(prisma, existing.restaurantId, anchor));
    return;
  }

  const { setup, menu, suppliers } = await prisma.$transaction(async (tx) => {
    if (!existing && (await tx.restaurant.count()))
      throw new Error(
        '12-month seed requires a freshly migrated disposable database. Existing data was kept.',
      );
    const setup = await helpers.setupRestaurant(tx);
    const { restaurantId } = setup;
    if (existing && restaurantId !== existing.restaurantId)
      throw new Error('Saved seed does not match the demo restaurant');
    const stock = await seedStockItems(tx, restaurantId);
    const suppliers = await seedSuppliers(tx, restaurantId);
    const { items: menu } = await seedMenu(tx, restaurantId, stock);
    if (!existing) {
      await tx.$executeRaw`CREATE SCHEMA IF NOT EXISTS rms_seed`;
      await tx.$executeRaw`CREATE TABLE rms_seed.restaurant_history (
        singleton boolean PRIMARY KEY CHECK (singleton),
        restaurant_id uuid NOT NULL,
        seed bigint NOT NULL,
        anchor timestamptz NOT NULL,
        next_chunk integer NOT NULL DEFAULT 0,
        done boolean NOT NULL DEFAULT false
      )`;
      await tx.$executeRaw`INSERT INTO rms_seed.restaurant_history
        (singleton, restaurant_id, seed, anchor) VALUES (true, ${restaurantId}::uuid, ${BigInt(seed)}, ${anchor})`;
    }
    return { setup, menu, suppliers };
  }, transactionOptions);

  const { restaurantId, users, statusIds, billing } = setup;
  const owner = users.find((user) => user.role === 'OWNER');
  const manager = users.find((user) => user.role === 'MANAGER');
  if (!owner || !manager) throw new Error('Inventory history requires an owner and manager');

  for (const [index, chunk] of chunks.entries()) {
    if (index < (existing?.nextChunk ?? 0)) continue;
    const service = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'inventory:' + restaurantId}, 0))`;
      const stockItems = await tx.stockItem.findMany({ where: { restaurantId } });
      await seedInventoryActivity(
        tx,
        restaurantId,
        new Map(stockItems.map((item) => [item.name, item])),
        suppliers,
        { owner: owner.id, manager: manager.id },
        { ...chunk, now: anchor },
      );
      const service = await seedServiceHistory(tx, {
        restaurantId,
        users,
        statusIds,
        menu,
        ...billing,
        tables: await helpers.loadTables(tx, restaurantId),
        year: { ...chunk, seed, now: anchor },
      });
      if (chunk.live) await validateYearSeed(tx, restaurantId, anchor);
      const updated = await tx.$executeRaw`
        UPDATE rms_seed.restaurant_history SET next_chunk = ${index + 1}, done = ${chunk.live}
        WHERE singleton AND next_chunk = ${index}`;
      if (updated !== 1) throw new Error('Seed progress changed unexpectedly');
      return service;
    }, transactionOptions);
    console.log(`  Saved chunk ${index + 1}/${chunks.length} (${service.orders} orders)`);
    for (const line of service.live) console.log(`    live: ${line}`);
  }
  await analyzeYearSeed(prisma);
  console.table(await validateYearSeed(prisma, restaurantId, anchor));
  console.log(
    `Seeded 12 months for "${restaurantId}" in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
  );
}
