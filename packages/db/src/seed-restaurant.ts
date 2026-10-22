/**
 * Seeds one fully-usable restaurant with its people and floor for local/dev work.
 *
 * Creates: the restaurant, all system roles (with permissions sourced from
 * @rms/permissions, exactly as signup provisioning does), an owner, a captain
 * and one user per remaining role, plus the system table statuses, a dining
 * section and a handful of tables.
 *
 * Idempotent: every write is keyed on a natural unique column (user email,
 * role name, table status code, table number per tenant), so re-running makes
 * no duplicate rows. Each run is authoritative over the shared dev password —
 * it (re)sets every seeded account to SHARED_PASSWORD, even one that already
 * existed, so the known credentials below always work.
 *
 *   yarn workspace @rms/db seed:restaurant
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { ALL_ROLES, Role, ROLE_PERMISSIONS, type Role as RoleName } from '@rms/permissions';
import { hash } from 'bcrypt';

// Matches apps/api BCRYPT_ROUNDS; kept local so @rms/db does not depend on the api app.
const BCRYPT_ROUNDS = 10;

const SHARED_PASSWORD = 'qwerty123';
const RESTAURANT_NAME = "John's Bistro";

const OWNER = { name: 'John Doe', email: 'john.doe@gmail.com' } as const;

/** One account per non-owner role so every part of the app can be exercised. */
const STAFF: readonly { role: RoleName; name: string; email: string }[] = [
  { role: Role.MANAGER, name: 'Meera Manager', email: 'manager@gmail.com' },
  { role: Role.CAPTAIN, name: 'Karan Captain', email: 'captain@gmail.com' },
  { role: Role.KITCHEN_STAFF, name: 'Kiran Kitchen', email: 'kitchen@gmail.com' },
  { role: Role.BAR_STAFF, name: 'Bela Bar', email: 'bar@gmail.com' },
  { role: Role.CASHIER, name: 'Chetan Cashier', email: 'cashier@gmail.com' },
];

/** System lifecycle statuses (matches @rms/shared TABLE_STATUS_CODES). */
const TABLE_STATUSES: readonly { code: string; name: string }[] = [
  { code: 'AVAILABLE', name: 'Available' },
  { code: 'RESERVED', name: 'Reserved' },
  { code: 'OCCUPIED', name: 'Occupied' },
  { code: 'NEEDS_CLEANING', name: 'Cleaning' },
];

const DINING_SECTION_NAME = 'Main Hall';
const TABLES: readonly { tableNumber: string; capacity: number }[] = [
  { tableNumber: 'T1', capacity: 2 },
  { tableNumber: 'T2', capacity: 4 },
  { tableNumber: 'T3', capacity: 4 },
  { tableNumber: 'T4', capacity: 6 },
];

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

  const created = await tx.restaurant.create({
    data: { name: RESTAURANT_NAME },
    select: { id: true },
  });
  return created.id;
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
): Promise<void> {
  const people = [{ role: Role.OWNER, ...OWNER }, ...STAFF];

  for (const person of people) {
    const roleId = roleIds.get(person.role);
    if (!roleId) throw new Error(`Role ${person.role} was not seeded`);

    await tx.user.upsert({
      where: { email: person.email },
      create: {
        restaurantId,
        roleId,
        name: person.name,
        email: person.email,
        passwordHash,
      },
      update: { restaurantId, roleId, name: person.name, passwordHash },
      select: { id: true },
    });
  }
}

/** Seeds system table statuses, a dining section and a few available tables. */
async function seedFloor(tx: Prisma.TransactionClient, restaurantId: string): Promise<void> {
  const statusIds = new Map<string, string>();
  for (const [index, status] of TABLE_STATUSES.entries()) {
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

  // DiningSection has no natural unique key, so match on (restaurantId, name).
  const existingSection = await tx.diningSection.findFirst({
    where: { restaurantId, name: DINING_SECTION_NAME },
    select: { id: true },
  });
  const sectionId =
    existingSection?.id ??
    (
      await tx.diningSection.create({
        data: { restaurantId, name: DINING_SECTION_NAME, sortOrder: 0 },
        select: { id: true },
      })
    ).id;

  for (const table of TABLES) {
    await tx.restaurantTable.upsert({
      where: { restaurantId_tableNumber: { restaurantId, tableNumber: table.tableNumber } },
      create: {
        restaurantId,
        sectionId,
        currentStatusId: availableStatusId,
        tableNumber: table.tableNumber,
        capacity: table.capacity,
      },
      update: { capacity: table.capacity },
      select: { id: true },
    });
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const passwordHash = await hash(SHARED_PASSWORD, BCRYPT_ROUNDS);

  try {
    await prisma.$transaction(async (tx) => {
      const restaurantId = await resolveRestaurantId(tx);
      const roleIds = await seedRoles(tx, restaurantId);
      await seedUsers(tx, restaurantId, roleIds, passwordHash);
      await seedFloor(tx, restaurantId);

      console.log(`Seeded "${RESTAURANT_NAME}" (${restaurantId}):`);
      console.log(`  ${roleIds.size} roles, ${1 + STAFF.length} users, ${TABLES.length} tables.`);
    });

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
