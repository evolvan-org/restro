import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CancelOperatingTask,
  type CreateOperatingTask,
  type OperatingTask,
  type OperatingTaskAssignees,
  operatingTaskEventSchema,
  type OperatingTaskHistory,
  type OperatingTaskList,
  type OperatingTaskQuery,
  type RecordOperatingTask,
  type ResolveOperatingTask,
  type UpdateOperatingTask,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { buildPageMeta } from '@rms/shared';

import { actorCan } from '../common/auth/actor-permissions';
import type { Actor } from '../common/auth/authenticated-request';
import { roleCan } from '../common/auth/role-access';
import { toOperatingTask } from './operating-tasks.mapper';
import { type OperatingTaskLock, OperatingTasksRepository } from './operating-tasks.repository';

@Injectable()
export class OperatingTasksService {
  constructor(private readonly repository: OperatingTasksRepository) {}
  async assignees(actor: Actor): Promise<OperatingTaskAssignees> {
    const users = await this.repository.assignees(actor.restaurantId);
    return {
      data: users
        .filter(
          (user) =>
            roleCan(user.role, Permission.TASK_READ) &&
            roleCan(user.role, Permission.TASK_COMPLETE),
        )
        .map(({ id, name }) => ({ id, name })),
    };
  }
  async list(actor: Actor, query: OperatingTaskQuery): Promise<OperatingTaskList> {
    const { items, total } = await this.repository.list(
      actor.restaurantId,
      query,
      this.visibility(actor),
    );
    const now = new Date();
    return {
      data: items.map((item) => toOperatingTask(item, now)),
      meta: buildPageMeta(query.page, query.pageSize, total),
      updatedAt: now.toISOString(),
    };
  }
  async create(actor: Actor, input: CreateOperatingTask): Promise<OperatingTask> {
    this.validateAssignee(
      await this.repository.assignee(actor.restaurantId, input.assignedToUserId),
    );
    return this.repository.create(
      actor.restaurantId,
      actor.userId,
      input,
      async (record, saveEvent) => {
        const task = toOperatingTask(record);
        await saveEvent(task, 'CREATED', task.isOverdue);
        return task;
      },
    );
  }
  async update(actor: Actor, id: string, input: UpdateOperatingTask): Promise<OperatingTask> {
    return this.repository.withLockedTask(
      actor.restaurantId,
      id,
      actor.userId,
      undefined,
      async (context) => {
        const { expectedVersion, ...values } = input;
        const current = this.current(context, expectedVersion);
        if (current.status !== 'PENDING')
          throw new ConflictException('Only pending tasks can be edited');
        this.validateAssignee(await context.findAssignee(input.assignedToUserId));

        const updated = toOperatingTask(
          await context.update({ ...values, dueAt: new Date(values.dueAt) }),
        );
        await context.recordEvent(updated, 'UPDATED', current.dueAt < new Date());
        return updated;
      },
    );
  }
  async record(actor: Actor, id: string, input: RecordOperatingTask): Promise<OperatingTask> {
    return this.repository.withLockedTask(
      actor.restaurantId,
      id,
      actor.userId,
      this.visibility(actor),
      async (context) => {
        const { expectedVersion, outcome, ...result } = input;
        const current = this.current(context, expectedVersion);
        if (current.status !== 'PENDING')
          throw new ConflictException('This task already has a recorded outcome');
        if (current.kind === 'TEMPERATURE' && input.temperatureCelsius === null)
          throw new BadRequestException('Record the measured temperature in Celsius');
        if (current.kind === 'EXPIRY' && input.observedExpiryDate === null)
          throw new BadRequestException('Record the inspected expiry date');
        const now = new Date();
        const updated = toOperatingTask(
          await context.update({
            status: outcome,
            result,
            completedAt: outcome === 'COMPLETED' ? now : null,
          }),
        );
        await context.recordEvent(updated, outcome, current.dueAt < now, result.notes);
        return updated;
      },
    );
  }
  async cancel(actor: Actor, id: string, input: CancelOperatingTask): Promise<OperatingTask> {
    return this.repository.withLockedTask(
      actor.restaurantId,
      id,
      actor.userId,
      undefined,
      async (context) => {
        const current = this.current(context, input.expectedVersion);
        if (!['PENDING', 'EXCEPTION'].includes(current.status))
          throw new ConflictException('Only pending tasks or exceptions can be cancelled');
        const updated = toOperatingTask(
          await context.update({ status: 'CANCELLED', resolution: input.reason }),
        );
        await context.recordEvent(updated, 'CANCELLED', current.dueAt < new Date(), input.reason);
        return updated;
      },
    );
  }
  async resolve(actor: Actor, id: string, input: ResolveOperatingTask): Promise<OperatingTask> {
    return this.repository.withLockedTask(
      actor.restaurantId,
      id,
      actor.userId,
      undefined,
      async (context) => {
        const current = this.current(context, input.expectedVersion);
        if (current.status !== 'EXCEPTION')
          throw new ConflictException('Only an exception can be resolved');
        const now = new Date();
        const updated = toOperatingTask(
          await context.update({
            status: 'COMPLETED',
            completedAt: now,
            resolution: input.resolution,
          }),
        );
        await context.recordEvent(updated, 'RESOLVED', current.dueAt < now, input.resolution);
        return updated;
      },
    );
  }
  async history(
    actor: Actor,
    id: string,
    page: number,
    pageSize: number,
  ): Promise<OperatingTaskHistory> {
    const history = await this.repository.history(
      actor.restaurantId,
      id,
      page,
      pageSize,
      this.visibility(actor),
    );
    if (!history) throw new NotFoundException('Task not found');
    return {
      data: history.items.map((event) =>
        operatingTaskEventSchema.parse({
          id: event.id,
          action: event.action,
          snapshot: event.snapshot,
          wasOverdue: event.wasOverdue,
          reason: event.reason,
          recordedBy: event.recordedBy,
          createdAt: event.createdAt.toISOString(),
        }),
      ),
      meta: buildPageMeta(page, pageSize, history.total),
    };
  }
  private current(context: OperatingTaskLock, expectedVersion: number) {
    if (!context.task) throw new NotFoundException('Task not found');
    if (context.task.version !== expectedVersion)
      throw new ConflictException('This task changed. Refresh and try again.');
    return context.task;
  }
  private visibility(actor: Actor): string | undefined {
    return actorCan(actor, Permission.TASK_MANAGE) ? undefined : actor.userId;
  }
  private validateAssignee(user: Awaited<ReturnType<OperatingTasksRepository['assignee']>>): void {
    if (!user) throw new NotFoundException('Active assignee not found');
    if (!roleCan(user.role, Permission.TASK_READ) || !roleCan(user.role, Permission.TASK_COMPLETE))
      throw new BadRequestException('The assignee needs task read and complete permissions');
  }
}
