import { PrismaClient } from '@prisma/client';
import { hash } from 'bcrypt';
import {
  ALL_ROLES,
  ROLE_PERMISSIONS,
  Role as SystemRole,
  type Role as SystemRoleName,
} from '@rms/permissions';

const prisma = new PrismaClient();

const seedRestaurantName = 'Demo Restaurant';
const seedUser = {
  name: 'Demo Admin',
  email: 'admin@demo.rms.local',
  password: 'Password@123',
};

const roleDescriptions: Record<SystemRoleName, string> = {
  [SystemRole.ADMIN]: 'Full access to restaurant management and configuration.',
  [SystemRole.MANAGER]: 'Manage restaurant settings and read user information.',
  [SystemRole.STAFF]: 'Operational staff access for restaurant workflows.',
  [SystemRole.CUSTOMER]: 'Customer-facing access.',
};

async function main(): Promise<void> {
  const passwordHash = await hash(seedUser.password, 10);

  const restaurant =
    (await prisma.restaurant.findFirst({
      where: { name: seedRestaurantName },
    })) ??
    (await prisma.restaurant.create({
      data: {
        name: seedRestaurantName,
        gstNumber: 'DEMO-GST-001',
        defaultGstRate: '5.00',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        status: 'ACTIVE',
      },
    }));

  const roles = await Promise.all(
    ALL_ROLES.map((roleName) =>
      prisma.role.upsert({
        where: {
          restaurantId_name: {
            restaurantId: restaurant.id,
            name: roleName,
          },
        },
        update: {
          description: roleDescriptions[roleName],
          isSystem: true,
        },
        create: {
          restaurantId: restaurant.id,
          name: roleName,
          description: roleDescriptions[roleName],
          isSystem: true,
        },
      }),
    ),
  );

  for (const role of roles) {
    const roleName = role.name as SystemRoleName;

    await Promise.all(
      ROLE_PERMISSIONS[roleName].map((permissionKey) =>
        prisma.rolePermission.upsert({
          where: {
            roleId_permissionKey: {
              roleId: role.id,
              permissionKey,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionKey,
          },
        }),
      ),
    );
  }

  const adminRole = roles.find((role) => role.name === SystemRole.ADMIN);

  if (!adminRole) {
    throw new Error('Seed failed: ADMIN role was not created.');
  }

  await prisma.user.upsert({
    where: {
      restaurantId_email: {
        restaurantId: restaurant.id,
        email: seedUser.email,
      },
    },
    update: {
      name: seedUser.name,
      roleId: adminRole.id,
      passwordHash,
      status: 'ACTIVE',
    },
    create: {
      restaurantId: restaurant.id,
      roleId: adminRole.id,
      name: seedUser.name,
      email: seedUser.email,
      passwordHash,
      status: 'ACTIVE',
    },
  });

  console.info('Seed complete');
  console.info(`Restaurant: ${restaurant.name}`);
  console.info(`Login email: ${seedUser.email}`);
  console.info(`Login password: ${seedUser.password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
