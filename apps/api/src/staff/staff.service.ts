import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateStaffRequest,
  type CreateStaffResponse,
  type StaffAccount,
  type StaffListQuery,
  type StaffListResponse,
  type StaffRolesResponse,
  type UpdateStaffRequest,
  type UpdateStaffStatusRequest,
} from '@rms/api-contract';
import { ROLE_PERMISSIONS, Role, isRole, roleHasAll } from '@rms/permissions';
import { buildPageMeta } from '@rms/shared';
import { hash } from 'bcrypt';
import type { Actor } from '../common/auth/authenticated-request';
import { BCRYPT_ROUNDS, generateTemporaryPassword } from '../common/auth/password';
import {
  StaffEmailConflictError,
  StaffRepository,
  type StaffDetails,
  type StaffRecord,
} from './staff.repository';

const EMAIL_IN_USE_MESSAGE = 'Email address is already in use';

@Injectable()
export class StaffService {
  constructor(private readonly staffRepository: StaffRepository) {}

  async list(actor: Actor, query: StaffListQuery): Promise<StaffListResponse> {
    const { page, pageSize, search, status } = query;
    const { items, total } = await this.staffRepository.findPage(actor.restaurantId, {
      search: search || undefined,
      status,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: items.map(toStaffAccount),
      meta: buildPageMeta(page, pageSize, total),
    };
  }

  async listAssignableRoles(actor: Actor): Promise<StaffRolesResponse> {
    const roles = await this.staffRepository.findRoles(actor.restaurantId);
    return roles.filter((role) => canAssignRole(actor, role.name));
  }

  async create(actor: Actor, input: CreateStaffRequest): Promise<CreateStaffResponse> {
    await this.assertRoleAssignable(actor, input.roleId);
    await this.assertEmailAvailable(actor.restaurantId, input.email);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hash(temporaryPassword, BCRYPT_ROUNDS);

    const created = await this.mapEmailConflict(() =>
      this.staffRepository.create({
        restaurantId: actor.restaurantId,
        passwordHash,
        ...toStaffDetails(input),
      }),
    );

    return { account: toStaffAccount(created), temporaryPassword };
  }

  async update(actor: Actor, userId: string, input: UpdateStaffRequest): Promise<StaffAccount> {
    const existing = await this.findManageable(actor, userId);

    if (input.roleId !== existing.role.id) {
      if (userId === actor.userId) {
        throw new ForbiddenException('You cannot change your own role');
      }
      await this.assertRoleAssignable(actor, input.roleId);
    }

    if (input.email !== existing.email.toLowerCase()) {
      await this.assertEmailAvailable(actor.restaurantId, input.email, userId);
    }

    const updated = await this.mapEmailConflict(() =>
      this.staffRepository.update(actor.restaurantId, userId, toStaffDetails(input)),
    );
    if (!updated) {
      throw new NotFoundException('Staff account not found');
    }

    return toStaffAccount(updated);
  }

  async updateStatus(
    actor: Actor,
    userId: string,
    input: UpdateStaffStatusRequest,
  ): Promise<StaffAccount> {
    if (userId === actor.userId) {
      throw new ForbiddenException('You cannot change your own account status');
    }

    const existing = await this.findManageable(actor, userId);
    if (existing.status === input.status) {
      return toStaffAccount(existing);
    }

    const updated = await this.staffRepository.updateStatus(
      actor.restaurantId,
      userId,
      input.status,
    );
    if (!updated) {
      throw new NotFoundException('Staff account not found');
    }
    return toStaffAccount(updated);
  }

  /** Loads a staff account in the actor's restaurant that the actor is allowed to manage. */
  private async findManageable(actor: Actor, userId: string): Promise<StaffRecord> {
    const staff = await this.staffRepository.findById(actor.restaurantId, userId);
    if (!staff) {
      throw new NotFoundException('Staff account not found');
    }

    if (!canAssignRole(actor, staff.role.name)) {
      throw new ForbiddenException('You cannot manage an account with this role');
    }

    return staff;
  }

  private async assertRoleAssignable(actor: Actor, roleId: string): Promise<void> {
    const role = await this.staffRepository.findRole(actor.restaurantId, roleId);
    if (!role || !canAssignRole(actor, role.name)) {
      throw new BadRequestException('The selected role cannot be assigned');
    }
  }

  private async assertEmailAvailable(
    restaurantId: string,
    email: string,
    excludeUserId?: string,
  ): Promise<void> {
    if (await this.staffRepository.isEmailTaken(restaurantId, email, excludeUserId)) {
      throw new ConflictException(EMAIL_IN_USE_MESSAGE);
    }
  }

  /** Two concurrent requests can both pass the email check; the unique index decides. */
  private async mapEmailConflict<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof StaffEmailConflictError) {
        throw new ConflictException(EMAIL_IN_USE_MESSAGE);
      }
      throw error;
    }
  }
}

/**
 * A staff role can be granted only if it is a known system role other than CUSTOMER and grants
 * nothing beyond the actor's own permissions, so nobody can create an account above themselves.
 */
function canAssignRole(actor: Actor, roleName: string): boolean {
  return (
    isRole(roleName) &&
    roleName !== Role.CUSTOMER &&
    roleHasAll(actor.role, ROLE_PERMISSIONS[roleName])
  );
}

function toStaffDetails(input: CreateStaffRequest | UpdateStaffRequest): StaffDetails {
  return {
    name: input.name,
    email: input.email,
    phone: input.phone || null,
    roleId: input.roleId,
  };
}

function toStaffAccount(record: StaffRecord): StaffAccount {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    phone: record.phone,
    status: record.status,
    role: record.role,
    createdAt: record.createdAt.toISOString(),
  };
}
