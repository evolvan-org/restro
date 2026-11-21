/**
 * Seeds one fully-usable restaurant for local/dev work.
 *
 * Creates: the restaurant (with GST/billing profile), all system roles (with
 * permissions sourced from @rms/permissions, exactly as signup provisioning
 * does), an owner and staff for every role, system table statuses, dining
 * sections with tables, bill cancellation reasons, a full menu with recipes,
 * the ingredient master, suppliers and inventory activity (opening stock,
 * purchase orders, goods receipts, waste, adjustments), regular guests, four
 * weeks of paid service history and a live floor for today.
 *
 * Idempotent: reference data is keyed on natural unique columns (user email,
 * role name, table number, item/supplier/category name), so re-running makes no
 * duplicates and never overwrites rows edited in the app. Transactional history
 * is written once: inventory activity is skipped when the restaurant already
 * has purchase orders or receipts, and service history when the seeded guests
 * already have reservations. Each run is authoritative over the shared dev
 * password — it (re)sets every seeded account to SHARED_PASSWORD, even one that
 * already existed, so the known credentials below always work.
 *
 * Only runs against a local/compose DATABASE_URL host; set ALLOW_SEED=1 to override.
 *
 *   yarn workspace @rms/db seed:restaurant
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { ALL_ROLES, Role, ROLE_PERMISSIONS, type Role as RoleName } from '@rms/permissions';
import { hash } from 'bcrypt';

import { DINING_SECTIONS, RESTAURANT_PROFILE } from './seed/catalog';
import { seedInventoryActivity, seedStockItems, seedSuppliers } from './seed/inventory';
import { seedMenu } from './seed/menu';
import { type SeedTable, type SeedUser, seedServiceHistory } from './seed/service-history';
import { assertSafeSeedTarget } from './seed/support';
import { BILL_CANCELLATION_REASONS, SYSTEM_TABLE_STATUSES } from './tenant-defaults';

// Matches apps/api BCRYPT_ROUNDS; kept local so @rms/db does not depend on the api app.
const BCRYPT_ROUNDS = 10;

const SHARED_PASSWORD = 'qwerty123';
const RESTAURANT_NAME = "John's Bistro";

const OWNER = { name: 'John Doe', email: 'john.doe@gmail.com' } as const;

/** One account per non-owner role so every part of the app can be exercised. */
const STAFF: readonly { role: RoleName; name: string; email: string }[] = [
  { role: Role.MANAGER, name: 'Meera Manager', email: 'manager@gmail.com' },
  { role: Role.CAPTAIN, name: 'Karan Captain', email: 'captain@gmail.com' },
  { role: Role.CAPTAIN, name: 'Rohan Captain', email: 'captain2@gmail.com' },
  { role: Role.KITCHEN_STAFF, name: 'Kiran Kitchen', email: 'kitchen@gmail.com' },
  { role: Role.BAR_STAFF, name: 'Bela Bar', email: 'bar@gmail.com' },
  { role: Role.RECEPTION, name: 'Rina Reception', email: 'reception@gmail.com' },
];

/** Long enough for the bulk history inserts; the default 5s interactive timeout is not. */
const TX_OPTIONS = { timeout: 120_000, maxWait: 10_000 } as const;

/** Finds the restaurant to seed into, keyed off the owner's (globally unique) email. */
async function resolveRestaurantId(tx: Prisma.TransactionClient): Promise<string> {
  const owner = await tx.user.findFirst({
    where: { email: { equals: OWNER.email, mode: 'insensitive' } },
    select: { restaurantId: true },
  });
  if (owner) return owner.restaurantId;

  const existing = await tx.restaurant.findFirst({
    where: { name: RESTAURANT_NAME },
    select: { id: true },
  });
  if (existing) return existing.id;

  // The demo restaurant is fully set up, so its owner skips guided onboarding.
  const created = await tx.restaurant.create({
    data: { name: RESTAURANT_NAME, onboardingCompletedAt: new Date() },
    select: { id: true },
  });
  return created.id;
}

/** Fills in the GST/billing profile without overwriting values already set in the app. */
async function seedRestaurantProfile(
  tx: Prisma.TransactionClient,
  restaurantId: string,
): Promise<{ gstRate: Prisma.Decimal; maxDiscountPercent: Prisma.Decimal }> {
  const restaurant = await tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
  const updated = await tx.restaurant.update({
    where: { id: restaurantId },
    data: {
      onboardingCompletedAt: restaurant.onboardingCompletedAt ?? new Date(),
      gstNumber: restaurant.gstNumber ?? RESTAURANT_PROFILE.gstNumber,
      address: restaurant.address ?? RESTAURANT_PROFILE.address,
      defaultGstRate: restaurant.defaultGstRate.isZero()
        ? RESTAURANT_PROFILE.defaultGstRate
        : restaurant.defaultGstRate,
    },
    select: { defaultGstRate: true, maxDiscountPercent: true },
  });
  await tx.billCancellationReason.createMany({
    data: BILL_CANCELLATION_REASONS.map((reason, sortOrder) => ({
      ...reason,
      restaurantId,
      sortOrder,
    })),
    skipDuplicates: true,
  });
  return { gstRate: updated.defaultGstRate, maxDiscountPercent: updated.maxDiscountPercent };
}

/** Upserts every system role and its permissions; returns a name → roleId map. */
async function seedRoles(
  tx: Prisma.TransactionClient,
  restaurantId: string,
): Promise<Map<RoleName, string>> {
  const roleIds = new Map<RoleName, string>();

  for (const name of ALL_ROLES) {
    const role = await tx.role.upsert({
      where: { restaurantId_name: { restaurantId, name } },
      create: { restaurantId, name, isSystem: true },
      update: { isSystem: true },
      select: { id: true },
    });
    roleIds.set(name, role.id);

    const permissions = ROLE_PERMISSIONS[name];
    if (permissions.length > 0) {
      await tx.rolePermission.createMany({
        data: permissions.map((permissionKey) => ({ roleId: role.id, permissionKey })),
        skipDuplicates: true,
      });
    }
  }

  return roleIds;
}

/** Creates each user if absent and keeps role/name/password in sync with the seed. */
async function seedUsers(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  roleIds: Map<RoleName, string>,
  passwordHash: string,
): Promise<SeedUser[]> {
  const people = [{ role: Role.OWNER, ...OWNER }, ...STAFF];
  const users: SeedUser[] = [];

  for (const person of people) {
    const roleId = roleIds.get(person.role);
    if (!roleId) throw new Error(`Role ${person.role} was not seeded`);

    const user = await tx.user.upsert({
      where: { email: person.email },
      create: {
        restaurantId,
        roleId,
        name: person.name,
        email: person.email,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
      update: {
        restaurantId,
        roleId,
        name: person.name,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    users.push({ id: user.id, role: person.role });
  }
  return users;
}

/** Seeds system table statuses, dining sections and their tables; returns status ids by code. */
async function seedFloor(
  tx: Prisma.TransactionClient,
  restaurantId: string,
): Promise<Map<string, string>> {
  const statusIds = new Map<string, string>();
  for (const [index, status] of SYSTEM_TABLE_STATUSES.entries()) {
    const row = await tx.tableStatus.upsert({
      where: { restaurantId_code: { restaurantId, code: status.code } },
      create: {
        restaurantId,
        code: status.code,
        name: status.name,
        sortOrder: index,
        isSystem: true,
      },
      update: { name: status.name, sortOrder: index, isSystem: true },
      select: { id: true },
    });
    statusIds.set(status.code, row.id);
  }

  const availableStatusId = statusIds.get('AVAILABLE');
  if (!availableStatusId) throw new Error('AVAILABLE table status was not seeded');

  for (const [sortOrder, section] of DINING_SECTIONS.entries()) {
    // DiningSection has no natural unique key, so match on (restaurantId, name).
    const existingSection = await tx.diningSection.findFirst({
      where: { restaurantId, name: section.name },
      select: { id: true },
    });
    const sectionId =
      existingSection?.id ??
      (
        await tx.diningSection.create({
          data: {
            restaurantId,
            name: section.name,
            description: section.description,
            sortOrder,
            isActive: section.isActive ?? true,
          },
          select: { id: true },
        })
      ).id;

    for (const table of section.tables) {
      await tx.restaurantTable.upsert({
        where: { restaurantId_tableNumber: { restaurantId, tableNumber: table.tableNumber } },
        create: {
          restaurantId,
          sectionId,
          currentStatusId: availableStatusId,
          tableNumber: table.tableNumber,
          capacity: table.capacity,
          isActive: table.isActive ?? true,
        },
        update: { capacity: table.capacity },
        select: { id: true },
      });
    }
  }
  return statusIds;
}

/** Active tables in active sections, flagged free when nothing is seated or ordered on them. */
async function loadTables(
  tx: Prisma.TransactionClient,
  restaurantId: string,
): Promise<SeedTable[]> {
  const tables = await tx.restaurantTable.findMany({
    where: { restaurantId, isActive: true, section: { isActive: true } },
    select: {
      id: true,
      tableNumber: true,
      capacity: true,
      currentStatus: { select: { code: true } },
      orders: { where: { status: { in: ['OPEN', 'SUBMITTED'] } }, select: { id: true } },
      reservations: { where: { status: { in: ['BOOKED', 'SEATED'] } }, select: { id: true } },
    },
    orderBy: { tableNumber: 'asc' },
  });
  return tables.map((table) => ({
    id: table.id,
    tableNumber: table.tableNumber,
    capacity: table.capacity,
    free:
      table.currentStatus.code === 'AVAILABLE' &&
      table.orders.length === 0 &&
      table.reservations.length === 0,
  }));
}

async function main(): Promise<void> {
  assertSafeSeedTarget();
  const prisma = new PrismaClient();
  const passwordHash = await hash(SHARED_PASSWORD, BCRYPT_ROUNDS);

  try {
    const setup = await prisma.$transaction(async (tx) => {
      const restaurantId = await resolveRestaurantId(tx);
      const billing = await seedRestaurantProfile(tx, restaurantId);
      const roleIds = await seedRoles(tx, restaurantId);
      const users = await seedUsers(tx, restaurantId, roleIds, passwordHash);
      const statusIds = await seedFloor(tx, restaurantId);
      return { restaurantId, billing, roleCount: roleIds.size, users, statusIds };
    }, TX_OPTIONS);
    const { restaurantId, users } = setup;
    const userId = (role: RoleName): string => {
      const user = users.find((entry) => entry.role === role);
      if (!user) throw new Error(`No seeded ${role} user`);
      return user.id;
    };

    const catalog = await prisma.$transaction(async (tx) => {
      const stock = await seedStockItems(tx, restaurantId);
      const suppliers = await seedSuppliers(tx, restaurantId);
      const menu = await seedMenu(tx, restaurantId, stock);
      return { stock, suppliers, menu };
    }, TX_OPTIONS);

    const inventory = await prisma.$transaction(async (tx) => {
      // Same advisory lock the API takes, so a running app can't interleave stock writes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'inventory:' + restaurantId}, 0))`;
      return seedInventoryActivity(tx, restaurantId, catalog.stock, catalog.suppliers, {
        owner: userId(Role.OWNER),
        manager: userId(Role.MANAGER),
      });
    }, TX_OPTIONS);

    const service = await prisma.$transaction(
      async (tx) =>
        seedServiceHistory(tx, {
          restaurantId,
          users,
          tables: await loadTables(tx, restaurantId),
          menu: catalog.menu.items,
          statusIds: setup.statusIds,
          gstRate: setup.billing.gstRate,
          maxDiscountPercent: setup.billing.maxDiscountPercent,
        }),
      TX_OPTIONS,
    );

    const tableCount = DINING_SECTIONS.reduce((sum, section) => sum + section.tables.length, 0);
    console.log(`Seeded "${RESTAURANT_NAME}" (${restaurantId}):`);
    console.log(`  ${setup.roleCount} roles, ${users.length} users`);
    console.log(`  ${DINING_SECTIONS.length} dining sections, ${tableCount} tables`);
    console.log(
      `  ${catalog.menu.items.length} menu items, ${catalog.menu.recipeLines} new recipe lines` +
        (catalog.menu.skipped.length
          ? ` (skipped ${catalog.menu.skipped.length} with mismatched units)`
          : ''),
    );
    console.log(
      `  ${catalog.stock.size} ingredients, ${catalog.suppliers.size} suppliers, opened stock for ${inventory.opened}`,
    );
    console.log(
      inventory.skippedHistory
        ? '  Inventory history already present: skipped purchase orders and receipts'
        : `  ${inventory.purchaseOrders} purchase orders, ${inventory.receipts} goods receipts, waste and adjustments`,
    );
    if (service.skipped) {
      console.log(`  Service history already present: skipped (${service.guests} guests)`);
    } else {
      console.log(
        `  ${service.guests} guests, ${service.reservations} reservations, ${service.orders} orders, ` +
          `${service.kots} KOTs, ${service.bills} bills`,
      );
      for (const line of service.live) console.log(`    live: ${line}`);
    }

    console.log('\nLogin credentials (password for all): ' + SHARED_PASSWORD);
    console.log(`  OWNER          ${OWNER.email}`);
    for (const person of STAFF) {
      console.log(`  ${person.role.padEnd(14)} ${person.email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
