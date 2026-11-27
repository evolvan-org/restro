import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AvailabilityQuery,
  type CancelWorkforceRecord,
  type CreateStaffAvailability,
  type CreateStaffShift,
  type DecideStaffLeave,
  type ReplaceStaffShift,
  type RequestStaffLeave,
  type ShiftClash,
  type ShiftQuery,
  type StaffAvailability,
  type StaffAvailabilityList,
  type StaffLeave,
  type StaffLeaveList,
  type StaffLeaveQuery,
  type StaffShift,
  type StaffShiftList,
  type UpdateStaffAvailability,
  type UpdateStaffShift,
  workforceEventSchema,
  type WorkforceHistory,
  type WorkforceSnapshot,
  type WorkforceStaff,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { buildPageMeta } from '@rms/shared';

import { actorCan } from '../common/auth/actor-permissions';
import type { Actor } from '../common/auth/authenticated-request';
import { roleCan } from '../common/auth/role-access';
import { toAvailability, toShiftSnapshot, toStaffLeave } from './workforce.mapper';
import {
  type WorkforceContext,
  type WorkforceFacts,
  WorkforceRepository,
} from './workforce.repository';

@Injectable()
export class WorkforceService {
  constructor(private readonly repository: WorkforceRepository) {}
  async staff(actor: Actor): Promise<WorkforceStaff> {
    const users = await this.repository.staff(actor.restaurantId);
    return {
      data: users
        .filter((user) => roleCan(user.role, Permission.SCHEDULE_READ))
        .map(({ id, name }) => ({ id, name })),
    };
  }
  async shifts(actor: Actor, query: ShiftQuery): Promise<StaffShiftList> {
    this.range(query);
    const result = await this.repository.shifts(actor.restaurantId, query, this.visibility(actor));
    return {
      data: result.items.map((record) => ({
        ...toShiftSnapshot(record),
        clashes:
          record.status === 'CANCELLED'
            ? []
            : this.clashes(
                {
                  id: record.id,
                  userId: record.userId,
                  startsAt: record.startsAt,
                  endsAt: record.endsAt,
                  userStatus: record.user.status,
                },
                result.facts,
              ),
      })),
      meta: buildPageMeta(query.page, query.pageSize, result.total),
      updatedAt: new Date().toISOString(),
    };
  }
  async createShift(actor: Actor, input: CreateStaffShift): Promise<StaffShift> {
    return this.repository.withLockedWorkforce(
      actor.restaurantId,
      actor.userId,
      async (context) => {
        await this.safeAssignment(context, input);
        const record = await context.shifts.create(input);
        const snapshot = toShiftSnapshot(record);
        await context.record({ entity: 'SHIFT', data: snapshot }, 'CREATED');
        return { ...snapshot, clashes: [] };
      },
    );
  }
  async updateShift(actor: Actor, id: string, input: UpdateStaffShift): Promise<StaffShift> {
    return this.repository.withLockedWorkforce(
      actor.restaurantId,
      actor.userId,
      async (context) => {
        const current = this.requireRecord(await context.shifts.find(id), input.expectedVersion);
        if (current.status !== 'SCHEDULED')
          throw new ConflictException('Cancelled shifts cannot be edited');
        await this.safeAssignment(context, input, id);
        const updated = await context.shifts.update(id, {
          userId: input.userId,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          note: input.note,
        });
        const snapshot = toShiftSnapshot(updated);
        await context.record(
          { entity: 'SHIFT', data: snapshot },
          current.userId === input.userId ? 'UPDATED' : 'REASSIGNED',
          input.reason,
        );
        return { ...snapshot, clashes: [] };
      },
    );
  }
  async replaceShift(actor: Actor, id: string, input: ReplaceStaffShift): Promise<StaffShift> {
    return this.repository.withLockedWorkforce(
      actor.restaurantId,
      actor.userId,
      async (context) => {
        const current = this.requireRecord(await context.shifts.find(id), input.expectedVersion);
        if (current.status !== 'SCHEDULED')
          throw new ConflictException('Cancelled shifts cannot be covered');
        if (current.userId === input.replacementUserId)
          throw new BadRequestException('Choose a different staff member for replacement cover');
        await this.safeAssignment(
          context,
          {
            userId: input.replacementUserId,
            startsAt: current.startsAt.toISOString(),
            endsAt: current.endsAt.toISOString(),
          },
          id,
        );
        const updated = await context.shifts.update(id, { userId: input.replacementUserId });
        const snapshot = toShiftSnapshot(updated);
        await context.record({ entity: 'SHIFT', data: snapshot }, 'REASSIGNED', input.reason);
        return { ...snapshot, clashes: [] };
      },
    );
  }
  async cancelShift(actor: Actor, id: string, input: CancelWorkforceRecord): Promise<StaffShift> {
    return this.repository.withLockedWorkforce(
      actor.restaurantId,
      actor.userId,
      async (context) => {
        const current = this.requireRecord(await context.shifts.find(id), input.expectedVersion);
        if (current.status !== 'SCHEDULED')
          throw new ConflictException('The shift is already cancelled');
        const snapshot = toShiftSnapshot(await context.shifts.update(id, { status: 'CANCELLED' }));
        await context.record({ entity: 'SHIFT', data: snapshot }, 'CANCELLED', input.reason);
        return { ...snapshot, clashes: [] };
      },
    );
  }
  async availability(actor: Actor, query: AvailabilityQuery): Promise<StaffAvailabilityList> {
    this.range(query);
    const result = await this.repository.availability(
      actor.restaurantId,
      query,
      this.visibility(actor),
    );
    return {
      data: result.items.map(toAvailability),
      meta: buildPageMeta(query.page, query.pageSize, result.total),
    };
  }
  async createAvailability(
    actor: Actor,
    input: CreateStaffAvailability,
  ): Promise<StaffAvailability> {
    const userId = this.selfTarget(actor, input.userId);
    return this.repository.withLockedWorkforce(
      actor.restaurantId,
      actor.userId,
      async (context) => {
        await this.eligibleStaff(context, userId);
        const snapshot = toAvailability(await context.availability.create(userId, input));
        await context.record({ entity: 'AVAILABILITY', data: snapshot }, 'CREATED');
        return snapshot;
      },
    );
  }
  async updateAvailability(
    actor: Actor,
    id: string,
    input: UpdateStaffAvailability,
  ): Promise<StaffAvailability> {
    return this.repository.withLockedWorkforce(
      actor.restaurantId,
      actor.userId,
      async (context) => {
        const current = this.requireRecord(
          await context.availability.find(id, this.visibility(actor)),
          input.expectedVersion,
        );
        this.selfTarget(actor, current.userId);
        if (!current.isActive)
          throw new ConflictException('Archived availability cannot be edited');
        const snapshot = toAvailability(
          await context.availability.update(id, {
            startsAt: new Date(input.startsAt),
            endsAt: new Date(input.endsAt),
            kind: input.kind,
            note: input.note,
          }),
        );
        await context.record({ entity: 'AVAILABILITY', data: snapshot }, 'UPDATED', input.reason);
        return snapshot;
      },
    );
  }
  async archiveAvailability(
    actor: Actor,
    id: string,
    input: CancelWorkforceRecord,
  ): Promise<StaffAvailability> {
    return this.repository.withLockedWorkforce(
      actor.restaurantId,
      actor.userId,
      async (context) => {
        const current = this.requireRecord(
          await context.availability.find(id, this.visibility(actor)),
          input.expectedVersion,
        );
        this.selfTarget(actor, current.userId);
        if (!current.isActive) throw new ConflictException('Availability is already archived');
        const snapshot = toAvailability(await context.availability.update(id, { isActive: false }));
        await context.record({ entity: 'AVAILABILITY', data: snapshot }, 'ARCHIVED', input.reason);
        return snapshot;
      },
    );
  }
  async leave(actor: Actor, query: StaffLeaveQuery): Promise<StaffLeaveList> {
    this.range(query);
    const visible = actorCan(actor, Permission.LEAVE_APPROVE) ? undefined : this.visibility(actor);
    const result = await this.repository.leave(actor.restaurantId, query, visible);
    return {
      data: result.items.map(toStaffLeave),
      actorUserId: actor.userId,
      meta: buildPageMeta(query.page, query.pageSize, result.total),
    };
  }
  async requestLeave(actor: Actor, input: RequestStaffLeave): Promise<StaffLeave> {
    const userId = this.selfTarget(actor, input.userId);
    return this.repository.withLockedWorkforce(
      actor.restaurantId,
      actor.userId,
      async (context) => {
        await this.eligibleStaff(context, userId);
        const snapshot = toStaffLeave(await context.leave.create(userId, input));
        await context.record({ entity: 'LEAVE', data: snapshot }, 'CREATED');
        return snapshot;
      },
    );
  }
  async decideLeave(actor: Actor, id: string, input: DecideStaffLeave): Promise<StaffLeave> {
    return this.repository.withLockedWorkforce(
      actor.restaurantId,
      actor.userId,
      async (context) => {
        const current = this.requireRecord(await context.leave.find(id), input.expectedVersion);
        if (current.status !== 'PENDING')
          throw new ConflictException('This leave request has already been decided');
        if (input.decision === 'APPROVED') {
          const facts = await context.facts([current.userId], current.startsAt, current.endsAt);
          if (facts.leave.some((entry) => entry.id !== id))
            throw new ConflictException('Approved leave already overlaps this request');
        }
        const snapshot = toStaffLeave(
          await context.leave.update(id, {
            status: input.decision,
            reviewedByUserId: actor.userId,
            reviewedAt: new Date(),
            reviewNote: input.reviewNote,
          }),
        );
        await context.record({ entity: 'LEAVE', data: snapshot }, input.decision, input.reviewNote);
        return snapshot;
      },
    );
  }
  async cancelLeave(actor: Actor, id: string, input: CancelWorkforceRecord): Promise<StaffLeave> {
    return this.repository.withLockedWorkforce(
      actor.restaurantId,
      actor.userId,
      async (context) => {
        const visible = actorCan(actor, Permission.LEAVE_APPROVE)
          ? undefined
          : this.visibility(actor);
        const current = this.requireRecord(
          await context.leave.find(id, visible),
          input.expectedVersion,
        );
        if (!['PENDING', 'APPROVED'].includes(current.status))
          throw new ConflictException('Only pending or approved leave can be cancelled');
        if (current.status === 'APPROVED') {
          if (!actorCan(actor, Permission.LEAVE_APPROVE))
            throw new ForbiddenException(
              'Leave approval permission is required to cancel approved leave',
            );
        } else this.selfTarget(actor, current.userId);
        const snapshot = toStaffLeave(await context.leave.update(id, { status: 'CANCELLED' }));
        await context.record({ entity: 'LEAVE', data: snapshot }, 'CANCELLED', input.reason);
        return snapshot;
      },
    );
  }
  async history(
    actor: Actor,
    entity: WorkforceSnapshot['entity'],
    id: string,
    page: number,
    pageSize: number,
  ): Promise<WorkforceHistory> {
    const visible =
      entity === 'LEAVE' && actorCan(actor, Permission.LEAVE_APPROVE)
        ? undefined
        : this.visibility(actor);
    const result = await this.repository.history(
      actor.restaurantId,
      entity,
      id,
      page,
      pageSize,
      visible,
    );
    if (!result) throw new NotFoundException('Workforce record not found');
    return {
      data: result.items.map((event) =>
        workforceEventSchema.parse({
          id: event.id,
          action: event.action,
          snapshot: event.snapshot,
          reason: event.reason,
          recordedBy: event.recordedBy,
          createdAt: event.createdAt.toISOString(),
        }),
      ),
      meta: buildPageMeta(page, pageSize, result.total),
    };
  }
  private visibility(actor: Actor): string | undefined {
    return actorCan(actor, Permission.WORKFORCE_MANAGE) ? undefined : actor.userId;
  }
  private selfTarget(actor: Actor, userId?: string): string {
    if (actorCan(actor, Permission.WORKFORCE_MANAGE)) return userId ?? actor.userId;
    if (userId && userId !== actor.userId) throw new NotFoundException('Staff member not found');
    if (!actorCan(actor, Permission.SCHEDULE_SELF))
      throw new ForbiddenException(
        'Permission to record your own availability or leave is required',
      );
    return actor.userId;
  }
  private requireRecord<T extends { version: number }>(record: T | null, version: number): T {
    if (!record) throw new NotFoundException('Workforce record not found');
    if (record.version !== version)
      throw new ConflictException('This record changed. Refresh and try again.');
    return record;
  }
  private range(query: { from?: string; to?: string }): void {
    if (query.from && query.to && Date.parse(query.to) <= Date.parse(query.from))
      throw new BadRequestException('The range must end after it starts');
  }
  private async eligibleStaff(context: WorkforceContext, userId: string): Promise<void> {
    const user = await context.staff(userId);
    if (!user) throw new NotFoundException('Active staff member not found');
    if (!roleCan(user.role, Permission.SCHEDULE_READ))
      throw new BadRequestException(
        'Staff need schedule read permission before receiving schedules',
      );
  }
  private async safeAssignment(
    context: WorkforceContext,
    input: { userId: string; startsAt: string; endsAt: string },
    id?: string,
  ): Promise<void> {
    await this.eligibleStaff(context, input.userId);
    const first = new Date(input.startsAt),
      last = new Date(input.endsAt);
    const facts = await context.facts([input.userId], first, last);
    const clashes = this.clashes(
      { id, userId: input.userId, startsAt: first, endsAt: last, userStatus: 'ACTIVE' },
      facts,
    );
    if (clashes.length) throw new ConflictException(clashes.map((entry) => entry.summary));
  }
  private clashes(
    input: { id?: string; userId: string; startsAt: Date; endsAt: Date; userStatus: string },
    facts: WorkforceFacts,
  ): ShiftClash[] {
    const matches = (entry: { userId: string; startsAt: Date; endsAt: Date }): boolean =>
      entry.userId === input.userId &&
      entry.startsAt < input.endsAt &&
      entry.endsAt > input.startsAt;
    return [
      ...facts.shifts
        .filter((entry) => entry.id !== input.id && matches(entry))
        .map((entry) => ({
          kind: 'SHIFT' as const,
          recordId: entry.id,
          summary: 'Another scheduled shift overlaps this period.',
        })),
      ...facts.unavailability.filter(matches).map((entry) => ({
        kind: 'UNAVAILABLE' as const,
        recordId: entry.id,
        summary: 'Recorded unavailability overlaps this shift.',
      })),
      ...facts.leave.filter(matches).map((entry) => ({
        kind: 'LEAVE' as const,
        recordId: entry.id,
        summary: 'Approved leave overlaps this shift; arrange replacement cover.',
      })),
      ...(input.userStatus !== 'ACTIVE'
        ? [
            {
              kind: 'INACTIVE_STAFF' as const,
              recordId: input.userId,
              summary: 'The assigned staff member is inactive; arrange replacement cover.',
            },
          ]
        : []),
    ];
  }
}
