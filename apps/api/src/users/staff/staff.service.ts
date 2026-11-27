import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type CreateStaffRequest,
  type CreateStaffResponse,
  type StaffAccount,
  type StaffEmailActionResponse,
  type StaffListQuery,
  type StaffListResponse,
  type StaffRole,
  type StaffRole,
  type StaffRolesResponse,
  type UpdateStaffRequest,
  type UpdateStaffStatusRequest,
} from '@rms/api-contract';
import { ELIGIBILITY_ONLY_PERMISSIONS } from '@rms/permissions';
import { buildPageMeta } from '@rms/shared';

import { AuthTokenService } from '../../auth-tokens/auth-token.service';
import { actorCanAll } from '../../common/auth/actor-permissions';
import type { Actor } from '../../common/auth/authenticated-request';
import { effectivePermissions, type RoleAccess } from '../../common/auth/role-access';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { EmailService } from '../../email/email.service';
import { deliverBestEffort } from '../../email/email-delivery';
import {
  LastOwnerError,
  type RoleRecord,
  type StaffDetails,
  StaffEmailConflictError,
  type StaffRecord,
  StaffRepository,
} from './staff.repository';

const EMAIL_IN_USE_MESSAGE = 'Email is already registered';

type InvitationContext = { restaurantName: string; inviterName: string };

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly repository: StaffRepository,
    private readonly tokens: AuthTokenService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async list(actor: Actor, query: StaffListQuery): Promise<StaffListResponse> {
    const { page, pageSize, search, status } = query;
    const { items, total } = await this.repository.findPage(actor.restaurantId, {
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
    return (await this.repository.findRoles(actor.restaurantId))
      .filter((role) => canAssignRole(actor, role))
      .map(toStaffRole);
  }

  async create(actor: Actor, input: CreateStaffRequest): Promise<CreateStaffResponse> {
    const role = await this.assertRoleAssignable(actor, input.roleId);
    await this.assertEmailAvailable(input.email);
    // Resolved before the account is created so a 403 can't leave a half-created invitation.
    const context = await this.invitationContext(actor);
    const created = await this.mapEmailConflict(() =>
      this.repository.create({ restaurantId: actor.restaurantId, ...toStaffDetails(input) }),
    );
    // The INVITED account is committed, so a provider outage must not fail the request (a retry
    // would only hit "Email is already registered"); the manager can resend the invitation.
    const emailSent = await deliverBestEffort(
      this.logger,
      { flow: 'staff-invite', userId: created.id },
      () => this.sendInvitation(actor.restaurantId, created, role.name, context),
    );
    return {
      account: toStaffAccount(created),
      message: emailSent
        ? 'Staff invitation sent'
        : "Staff account created, but the invitation email couldn't be sent. Use Resend invitation to try again.",
      emailSent,
    };
  }

  async update(actor: Actor, userId: string, input: UpdateStaffRequest): Promise<StaffAccount> {
    const existing = await this.findManageable(actor, userId);
    if (input.roleId !== existing.role.id) {
      if (userId === actor.userId) throw new ForbiddenException('You cannot change your own role');
      await this.assertRoleAssignable(actor, input.roleId);
    }

    const updated = await this.mapLastOwner(() =>
      this.repository.update(actor.restaurantId, userId, {
        name: input.name,
        phone: input.phone || null,
        roleId: input.roleId,
      }),
    );
    if (!updated) throw new NotFoundException('Staff account not found');
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
    if (existing.status === 'INVITED') {
      throw new BadRequestException('Pending invitations cannot be activated manually');
    }
    if (existing.status === input.status) return toStaffAccount(existing);

    const updated = await this.mapLastOwner(() =>
      this.repository.updateStatus(actor.restaurantId, userId, input.status),
    );
    if (!updated) throw new NotFoundException('Staff account not found');
    return toStaffAccount(updated);
  }

  async resendInvite(actor: Actor, userId: string): Promise<StaffEmailActionResponse> {
    const staff = await this.findManageable(actor, userId);
    if (staff.status !== 'INVITED') {
      throw new BadRequestException('Only pending invitations can be resent');
    }
    await this.rateLimit.consume('RESEND_STAFF_INVITE_MINUTE', userId, 1, 60_000);
    await this.rateLimit.consume('RESEND_STAFF_INVITE_HOUR', userId, 5, 60 * 60_000);
    await this.sendInvitation(
      actor.restaurantId,
      staff,
      staff.role.name,
      await this.invitationContext(actor),
    );
    return { message: 'Staff invitation resent' };
  }

  async sendPasswordReset(actor: Actor, userId: string): Promise<StaffEmailActionResponse> {
    const staff = await this.findManageable(actor, userId);
    if (staff.status === 'INVITED' || !['ACTIVE', 'INACTIVE'].includes(staff.status)) {
      throw new BadRequestException('A password reset cannot be sent for this account');
    }
    await this.rateLimit.consume('STAFF_PASSWORD_RESET_HOUR', userId, 5, 60 * 60_000);
    await this.tokens.issueAndDeliver(actor.restaurantId, staff.id, 'PASSWORD_RESET', (token) =>
      this.email.send({
        to: { email: staff.email, name: staff.name },
        template: 'RESET_PASSWORD',
        variables: {
          name: staff.name,
          resetUrl: this.publicUrl('/auth/reset-password', token.rawToken),
          expiresInMinutes: 60,
        },
        idempotencyKey: token.id,
      }),
    );
    return { message: 'Password reset email sent' };
  }

  private async invitationContext(actor: Actor): Promise<InvitationContext> {
    const context = await this.repository.findInvitationContext(actor.restaurantId, actor.userId);
    if (!context) throw new ForbiddenException('Inviting user is no longer active');
    return context;
  }

  private sendInvitation(
    restaurantId: string,
    staff: StaffRecord,
    roleName: string,
    context: InvitationContext,
  ): Promise<void> {
    return this.tokens.issueAndDeliver(restaurantId, staff.id, 'STAFF_INVITE', (token) =>
      this.email.send({
        to: { email: staff.email, name: staff.name },
        template: 'STAFF_INVITE',
        variables: {
          staffName: staff.name,
          restaurantName: context.restaurantName,
          inviterName: context.inviterName,
          roleName,
          acceptUrl: this.publicUrl('/auth/accept-invite', token.rawToken),
          expiresInDays: 7,
        },
        idempotencyKey: token.id,
      }),
    );
  }

  private publicUrl(path: string, token: string): string {
    const url = new URL(path, this.config.getOrThrow<string>('APP_PUBLIC_URL'));
    url.searchParams.set('token', token);
    return url.toString();
  }

  private async findManageable(actor: Actor, userId: string): Promise<StaffRecord> {
    const staff = await this.repository.findById(actor.restaurantId, userId);
    if (!staff) throw new NotFoundException('Staff account not found');
    if (staff.role.isOwner && !actor.isOwner) {
      throw new ForbiddenException('Only an Account Owner can manage another Account Owner');
    }
    if (!canAssignRole(actor, staff.role)) {
      throw new ForbiddenException('You cannot manage an account with this role');
    }
    return staff;
  }

  private async assertRoleAssignable(actor: Actor, roleId: string): Promise<RoleRecord> {
    const role = await this.repository.findRole(actor.restaurantId, roleId);
    if (!role || !canAssignRole(actor, role)) {
      throw new BadRequestException('The selected role cannot be assigned');
    }
    return role;
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    if (await this.repository.isEmailTaken(email))
      throw new ConflictException(EMAIL_IN_USE_MESSAGE);
  }

  private async mapLastOwner<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof LastOwnerError) {
        const action =
          error.change === 'role' ? 'changing their role' : 'deactivating their account';
        throw new ConflictException(
          `${error.ownerName} is the only active Account Owner. Make another team member an Owner before ${action}. The restaurant must always have at least one active Owner.`,
        );
      }
      throw error;
    }
  }

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

/** Only an Owner may assign the Owner role; anyone else may only hand out permissions they hold. */
function canAssignRole(actor: Actor, role: RoleAccess): boolean {
  if (role.isOwner) return actor.isOwner;
  return actorCanAll(
    actor,
    effectivePermissions(role).filter((p) => !ELIGIBILITY_ONLY_PERMISSIONS.includes(p)),
  );
}

function toStaffDetails(input: CreateStaffRequest): StaffDetails {
  return {
    name: input.name,
    email: input.email,
    phone: input.phone || null,
    roleId: input.roleId,
  };
}

function toStaffRole({ id, name }: RoleRecord): StaffRole {
  return { id, name };
}

function toStaffAccount(record: StaffRecord): StaffAccount {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    phone: record.phone,
    status: record.status,
    role: toStaffRole(record.role),
    createdAt: record.createdAt.toISOString(),
  };
}
