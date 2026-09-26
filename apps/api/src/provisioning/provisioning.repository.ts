import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';
import { ALL_ROLES, Role, ROLE_PERMISSIONS } from '@rms/permissions';

import { PrismaService } from '../common/database/prisma.service';

/** Everything needed to stand up a brand-new tenant and its owner. */
export type ProvisionOwnerInput = {
  restaurantName: string;
  owner: {
    name: string;
    email: string;
    passwordHash: string;
  };
};

export type ProvisionOwnerResult = {
  restaurantId: string;
  userId: string;
  roleId: string;
};

@Injectable()
export class ProvisioningRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Case-insensitive global lookup — email uniqueness for owner signup is
   * enforced across all tenants at the application layer (the DB constraint is
   * only per-tenant, `@@unique([restaurantId, email])`).
   */
  async emailExists(email: string): Promise<boolean> {
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });

    return existing !== null;
  }

  /**
   * Provisions a restaurant, seeds the system roles (with their permissions)
   * from `@rms/permissions`, and creates the signing-up user with the OWNER
   * role — all in a single transaction so a failure part-way leaves nothing
   * behind (AC4).
   */
  provisionOwner(input: ProvisionOwnerInput): Promise<ProvisionOwnerResult> {
    return this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: { name: input.restaurantName },
        select: { id: true },
      });

      let ownerRoleId: string | undefined;

      for (const role of ALL_ROLES) {
        const created = await tx.role.create({
          data: {
            restaurantId: restaurant.id,
            name: role,
            isSystem: true,
          },
          select: { id: true },
        });

        const permissions = ROLE_PERMISSIONS[role];
        if (permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: permissions.map((permissionKey): Prisma.RolePermissionCreateManyInput => ({
              roleId: created.id,
              permissionKey,
            })),
          });
        }

        if (role === Role.OWNER) {
          ownerRoleId = created.id;
        }
      }

      // ALL_ROLES always contains OWNER; this guards against a policy regression.
      if (!ownerRoleId) {
        throw new Error('OWNER role is missing from @rms/permissions role definitions');
      }

      const user = await tx.user.create({
        data: {
          restaurantId: restaurant.id,
          roleId: ownerRoleId,
          name: input.owner.name,
          email: input.owner.email,
          passwordHash: input.owner.passwordHash,
        },
        select: { id: true },
      });

      return {
        restaurantId: restaurant.id,
        userId: user.id,
        roleId: ownerRoleId,
      };
    });
  }
}
