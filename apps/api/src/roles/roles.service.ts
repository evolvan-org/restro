import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateRoleRequest,
  type DeleteRoleQuery,
  type RoleAuditListResponse,
  type RoleDetail,
  type RoleListResponse,
  type RoleSummary,
  type UpdateRolePermissionsRequest,
  type UpdateRoleRequest,
} from '@rms/api-contract';
import {
  ALL_PERMISSIONS,
  ELIGIBILITY_ONLY_PERMISSIONS,
  Permission,
  type Role,
  ROLE_PERMISSIONS,
} from '@rms/permissions';

import { actorCan } from '../common/auth/actor-permissions';
import type { Actor } from '../common/auth/authenticated-request';
import {
  RoleInUseError,
  RoleNameConflictError,
  type RoleRecord,
  RolesRepository,
} from './roles.repository';

const AUDIT_PAGE_SIZE = 100;
const PANEL_USER_LIMIT = 50;

@Injectable()
export class RolesService {
  constructor(private readonly repository: RolesRepository) {}

  async list(actor: Actor): Promise<RoleListResponse> {
    const roles = await this.repository.list(actor.restaurantId);
    return {
      items: roles.map(toSummary),
      grantable: grantableKeys(actor),
      actorRoleId: actor.roleId,
      actorRoleName: actor.role,
      canWrite: actorCan(actor, Permission.ROLE_WRITE),
    };
  }

  /** Saves permission edits for several roles all-or-nothing; every role is validated first. */
  async updatePermissions(
    actor: Actor,
    input: UpdateRolePermissionsRequest,
  ): Promise<RoleListResponse> {
    const items = [];
    for (const change of input.changes) {
      const role = await this.findOrThrow(actor, change.roleId);
      this.assertEditable(actor, role);
      const permissions = diff(role, unique(change.permissions));
      this.assertCanChange(actor, [...permissions.added, ...permissions.removed]);
      if (permissions.added.length > 0 || permissions.removed.length > 0) {
        items.push({ roleId: role.id, ...permissions });
      }
    }
    if (items.length > 0) {
      await this.repository.updateManyPermissions(actor.restaurantId, items, actor.userId);
    }
    return this.list(actor);
  }

  async get(actor: Actor, roleId: string): Promise<RoleDetail> {
    return this.toDetail(actor, await this.findOrThrow(actor, roleId));
  }

  async create(actor: Actor, input: CreateRoleRequest): Promise<RoleDetail> {
    let permissions = input.permissions;
    if (input.duplicateFromRoleId) {
      const source = await this.findOrThrow(actor, input.duplicateFromRoleId);
      if (source.isOwner) throw new ForbiddenException('The Owner role cannot be duplicated');
      permissions ??= catalogKeys(source);
    }
    const next = unique(permissions ?? []);
    this.assertCanChange(actor, next);

    const role = await this.mapConflict(() =>
      this.repository.create(
        actor.restaurantId,
        { name: input.name, description: input.description || null, permissions: next },
        { actorUserId: actor.userId },
      ),
    );
    return this.toDetail(actor, role);
  }

  async update(actor: Actor, roleId: string, input: UpdateRoleRequest): Promise<RoleDetail> {
    const role = await this.findOrThrow(actor, roleId);
    this.assertEditable(actor, role);

    if (input.name !== undefined && input.name !== role.name && role.isSystem) {
      throw new ForbiddenException('Default roles cannot be renamed');
    }

    const permissions = input.permissions ? diff(role, unique(input.permissions)) : undefined;
    if (permissions) this.assertCanChange(actor, [...permissions.added, ...permissions.removed]);

    const updated = await this.mapConflict(() =>
      this.repository.update(
        actor.restaurantId,
        role.id,
        { name: input.name, description: input.description },
        permissions,
        { actorUserId: actor.userId, action: 'UPDATED' },
      ),
    );
    return this.toDetail(actor, updated);
  }

  /** Restores a default role's seeded permissions. */
  async reset(actor: Actor, roleId: string): Promise<RoleDetail> {
    const role = await this.findOrThrow(actor, roleId);
    this.assertEditable(actor, role);
    const defaults = defaultPermissions(role);
    if (!defaults) throw new BadRequestException('Only default roles can be reset');

    const permissions = diff(role, defaults);
    this.assertCanChange(actor, [...permissions.added, ...permissions.removed]);
    const updated = await this.repository.update(actor.restaurantId, role.id, {}, permissions, {
      actorUserId: actor.userId,
      action: 'RESET',
    });
    return this.toDetail(actor, updated);
  }

  async remove(actor: Actor, roleId: string, query: DeleteRoleQuery): Promise<void> {
    const role = await this.findOrThrow(actor, roleId);
    this.assertEditable(actor, role);
    if (role.isSystem) throw new ForbiddenException('Default roles cannot be deleted');
    // Deleting revokes every permission the role holds from its users, so it is a revoke too.
    this.assertCanChange(actor, catalogKeys(role));

    let reassignTo: string | null = null;
    if (role._count.users > 0) {
      if (!query.reassignToRoleId) throw roleInUse(role._count.users);
      const target = await this.findOrThrow(actor, query.reassignToRoleId);
      if (target.id === role.id) throw new BadRequestException('Choose a different role');
      if (target.isOwner && !actor.isOwner) {
        throw new ForbiddenException('Only an Owner can assign the Owner role');
      }
      this.assertCanChange(actor, catalogKeys(target));
      reassignTo = target.id;
    }

    try {
      await this.repository.delete(actor.restaurantId, role, reassignTo, actor.userId);
    } catch (error) {
      if (error instanceof RoleInUseError) throw roleInUse(error.userCount);
      throw error;
    }
  }

  async listAudit(actor: Actor): Promise<RoleAuditListResponse> {
    const rows = await this.repository.listAudit(actor.restaurantId, AUDIT_PAGE_SIZE);
    return {
      items: rows.map((row) => ({
        id: row.id,
        roleName: row.roleName,
        action: row.action,
        actorName: row.actor?.name ?? null,
        addedKeys: row.addedKeys,
        removedKeys: row.removedKeys,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  private async findOrThrow(actor: Actor, roleId: string): Promise<RoleRecord> {
    const role = await this.repository.find(actor.restaurantId, roleId);
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  /** The Owner role is locked, and nobody edits their own role (anti-escalation). */
  private assertEditable(actor: Actor, role: RoleRecord): void {
    if (role.isOwner) throw new ForbiddenException('The Owner role cannot be edited');
    if (role.id === actor.roleId) throw new ForbiddenException('You cannot edit your own role');
  }

  /** An actor may only grant or revoke permissions they hold; eligibility markers are exempt. */
  private assertCanChange(actor: Actor, keys: readonly string[]): void {
    const denied = keys.filter(
      (key) =>
        !ELIGIBILITY_ONLY_PERMISSIONS.includes(key as Permission) &&
        !actorCan(actor, key as Permission),
    );
    if (denied.length > 0) {
      throw new ForbiddenException(
        `You cannot grant or revoke permissions you do not hold: ${denied.join(', ')}`,
      );
    }
  }

  private async toDetail(actor: Actor, role: RoleRecord): Promise<RoleDetail> {
    const canWrite = actorCan(actor, Permission.ROLE_WRITE);
    const users = await this.repository.listUsers(actor.restaurantId, role.id, PANEL_USER_LIMIT);
    return {
      ...toSummary(role),
      editable: canWrite && !role.isOwner && role.id !== actor.roleId,
      grantable: grantableKeys(actor),
      users,
    };
  }

  private async mapConflict<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof RoleNameConflictError) throw new ConflictException(error.message);
      throw error;
    }
  }
}

function toSummary(role: RoleRecord): RoleSummary {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    isOwner: role.isOwner,
    userCount: role._count.users,
    permissions: catalogKeys(role),
  };
}

function grantedKeys(role: RoleRecord): string[] {
  return role.permissions.map((p) => p.permissionKey);
}

/** Granted keys that are still in the catalog; stale stored keys are never exposed. */
function catalogKeys(role: RoleRecord): Permission[] {
  const granted = new Set(grantedKeys(role));
  return ALL_PERMISSIONS.filter((p) => granted.has(p));
}

function unique(keys: readonly string[]): string[] {
  return [...new Set(keys)];
}

function diff(role: RoleRecord, next: string[]) {
  const current = new Set<string>(catalogKeys(role));
  const wanted = new Set(next);
  // Stored grants outside the catalog confer no access. Preserve them when editing active grants.
  const retired = grantedKeys(role).filter((key) => !current.has(key));
  return {
    next: [...next, ...retired],
    added: next.filter((key) => !current.has(key)),
    removed: [...current].filter((key) => !wanted.has(key)),
  };
}

/** Seeded defaults for a system role; `undefined` for custom roles and the Owner. */
function defaultPermissions(role: RoleRecord): string[] | undefined {
  if (!role.isSystem || role.isOwner) return undefined;
  return [...(ROLE_PERMISSIONS[role.name as Role] ?? [])];
}

function grantableKeys(actor: Actor): Permission[] {
  return ALL_PERMISSIONS.filter(
    (p) => ELIGIBILITY_ONLY_PERMISSIONS.includes(p) || actorCan(actor, p),
  );
}

function roleInUse(userCount: number): ConflictException {
  return new ConflictException({
    message: `${userCount} user${userCount === 1 ? '' : 's'} still ${userCount === 1 ? 'has' : 'have'} this role. Reassign them first.`,
    error: 'Conflict',
    userCount,
  });
}
