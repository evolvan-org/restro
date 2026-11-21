import { Injectable } from '@nestjs/common';
import { Prisma, type RoleAuditAction } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const roleSelect = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  isOwner: true,
  permissions: { select: { permissionKey: true } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleSelect;

export type RoleRecord = Prisma.RoleGetPayload<{ select: typeof roleSelect }>;

export type AuditInput = {
  actorUserId: string;
  action: RoleAuditAction;
  addedKeys: readonly string[];
  removedKeys: readonly string[];
};

export class RoleNameConflictError extends Error {
  constructor() {
    super('A role with this name already exists');
    this.name = RoleNameConflictError.name;
  }
}

export class RoleInUseError extends Error {
  constructor(readonly userCount: number) {
    super(`${userCount} user(s) still have this role`);
    this.name = RoleInUseError.name;
  }
}

@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(restaurantId: string): Promise<RoleRecord[]> {
    return this.prisma.role.findMany({
      where: { restaurantId },
      select: roleSelect,
      orderBy: [{ isOwner: 'desc' }, { isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  find(restaurantId: string, roleId: string): Promise<RoleRecord | null> {
    return this.prisma.role.findFirst({ where: { id: roleId, restaurantId }, select: roleSelect });
  }

  async create(
    restaurantId: string,
    data: { name: string; description: string | null; permissions: readonly string[] },
    audit: Omit<AuditInput, 'action' | 'removedKeys' | 'addedKeys'>,
  ): Promise<RoleRecord> {
    return this.mapConflict(() =>
      this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: {
            restaurantId,
            name: data.name,
            description: data.description,
            permissions: { create: data.permissions.map((permissionKey) => ({ permissionKey })) },
          },
          select: roleSelect,
        });
        await this.writeAudit(tx, restaurantId, role, {
          ...audit,
          action: 'CREATED',
          addedKeys: data.permissions,
          removedKeys: [],
        });
        return role;
      }),
    );
  }

  /** Replaces name/description and, when given, the permission set, with an audit entry. */
  async update(
    restaurantId: string,
    roleId: string,
    data: { name?: string; description?: string | null },
    permissions: { next: readonly string[]; added: string[]; removed: string[] } | undefined,
    audit: Pick<AuditInput, 'actorUserId' | 'action'>,
  ): Promise<RoleRecord> {
    return this.mapConflict(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.role.update({ where: { id: roleId }, data });
        if (permissions) {
          await tx.rolePermission.deleteMany({ where: { roleId } });
          await tx.rolePermission.createMany({
            data: permissions.next.map((permissionKey) => ({ roleId, permissionKey })),
          });
        }
        const role = await tx.role.findUniqueOrThrow({ where: { id: roleId }, select: roleSelect });
        if (permissions && (permissions.added.length > 0 || permissions.removed.length > 0)) {
          await this.writeAudit(tx, restaurantId, role, {
            ...audit,
            addedKeys: permissions.added,
            removedKeys: permissions.removed,
          });
        }
        return role;
      }),
    );
  }

  /**
   * Deletes the role, first moving its users to `reassignToRoleId`. The user count is re-read in
   * the transaction so a user assigned meanwhile cannot be orphaned (the FK also restricts it).
   */
  delete(
    restaurantId: string,
    role: RoleRecord,
    reassignToRoleId: string | null,
    actorUserId: string,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      if (reassignToRoleId) {
        await tx.user.updateMany({
          where: { restaurantId, roleId: role.id },
          data: { roleId: reassignToRoleId, authVersion: { increment: 1 } },
        });
      }
      const remaining = await tx.user.count({ where: { roleId: role.id } });
      if (remaining > 0) throw new RoleInUseError(remaining);
      await tx.role.delete({ where: { id: role.id } });
      await this.writeAudit(tx, restaurantId, role, {
        actorUserId,
        action: 'DELETED',
        addedKeys: [],
        removedKeys: role.permissions.map((p) => p.permissionKey),
      });
    });
  }

  /** Applies permission changes to several roles in one transaction, auditing each. */
  updateManyPermissions(
    restaurantId: string,
    items: {
      roleId: string;
      next: readonly string[];
      added: string[];
      removed: string[];
    }[],
    actorUserId: string,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const role = await tx.role.findFirstOrThrow({
          where: { id: item.roleId, restaurantId },
          select: { id: true, name: true },
        });
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        await tx.rolePermission.createMany({
          data: item.next.map((permissionKey) => ({ roleId: role.id, permissionKey })),
        });
        await this.writeAudit(tx, restaurantId, role, {
          actorUserId,
          action: 'UPDATED',
          addedKeys: item.added,
          removedKeys: item.removed,
        });
      }
    });
  }

  listUsers(restaurantId: string, roleId: string, take: number) {
    return this.prisma.user.findMany({
      where: { restaurantId, roleId },
      select: { id: true, name: true, email: true, status: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take,
    });
  }

  listAudit(restaurantId: string, take: number) {
    return this.prisma.roleAuditLog.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { actor: { select: { name: true } } },
    });
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    role: { id: string; name: string },
    audit: AuditInput,
  ): Promise<void> {
    await tx.roleAuditLog.create({
      data: {
        restaurantId,
        roleId: role.id,
        roleName: role.name,
        actorUserId: audit.actorUserId,
        action: audit.action,
        addedKeys: [...audit.addedKeys],
        removedKeys: [...audit.removedKeys],
      },
    });
  }

  private async mapConflict<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new RoleNameConflictError();
      }
      throw error;
    }
  }
}
