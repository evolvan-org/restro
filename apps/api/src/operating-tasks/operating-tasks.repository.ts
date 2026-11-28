import { Injectable } from '@nestjs/common';
import {
  type CreateOperatingTask,
  type OperatingTask,
  type OperatingTaskQuery,
  operatingTaskSchema,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';

import { roleAccessSelect } from '../common/auth/role-access';
import { PrismaService } from '../common/database/prisma.service';

const taskInclude = {
  assignedTo: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.OperatingTaskInclude;
export type OperatingTaskRecord = Prisma.OperatingTaskGetPayload<{ include: typeof taskInclude }>;
type TaskChange = Partial<
  Pick<
    Prisma.OperatingTaskUncheckedUpdateInput,
    | 'title'
    | 'instructions'
    | 'kind'
    | 'assignedToUserId'
    | 'dueAt'
    | 'status'
    | 'completedAt'
    | 'result'
    | 'resolution'
  >
>;
export type OperatingTaskLock = {
  task: OperatingTaskRecord | null;
  findAssignee: (id: string) => ReturnType<OperatingTasksRepository['assignee']>;
  update: (change: TaskChange) => Promise<OperatingTaskRecord>;
  recordEvent: (
    task: OperatingTask,
    action: string,
    wasOverdue: boolean,
    reason?: string,
  ) => Promise<void>;
};

@Injectable()
export class OperatingTasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  assignees(restaurantId: string) {
    return this.prisma.user.findMany({
      where: { restaurantId, status: 'ACTIVE' },
      select: { id: true, name: true, role: { select: roleAccessSelect } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }
  assignee(restaurantId: string, id: string) {
    return this.prisma.user.findFirst({
      where: { id, restaurantId, status: 'ACTIVE' },
      select: { id: true, role: { select: roleAccessSelect } },
    });
  }
  async list(restaurantId: string, query: OperatingTaskQuery, visibleToUserId?: string) {
    const where: Prisma.OperatingTaskWhereInput = {
      restaurantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(visibleToUserId
        ? { assignedToUserId: visibleToUserId }
        : query.assignedToUserId
          ? { assignedToUserId: query.assignedToUserId }
          : {}),
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.operatingTask.findMany({
          where,
          include: taskInclude,
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.operatingTask.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, total };
  }
  create(
    restaurantId: string,
    createdByUserId: string,
    input: CreateOperatingTask,
    action: (
      task: OperatingTaskRecord,
      record: OperatingTaskLock['recordEvent'],
    ) => Promise<OperatingTask>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.operatingTask.create({
        data: { ...input, dueAt: new Date(input.dueAt), restaurantId, createdByUserId },
        include: taskInclude,
      });
      return action(task, this.eventWriter(tx, restaurantId, createdByUserId));
    });
  }
  withLockedTask<T>(
    restaurantId: string,
    id: string,
    userId: string,
    visibleToUserId: string | undefined,
    action: (context: OperatingTaskLock) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM operating_tasks WHERE id = ${id}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      const task = await tx.operatingTask.findFirst({
        where: {
          id,
          restaurantId,
          ...(visibleToUserId ? { assignedToUserId: visibleToUserId } : {}),
        },
        include: taskInclude,
      });
      return action({
        task,
        findAssignee: (assignedId) =>
          tx.user.findFirst({
            where: { id: assignedId, restaurantId, status: 'ACTIVE' },
            select: { id: true, role: { select: roleAccessSelect } },
          }),
        update: (change) =>
          tx.operatingTask.update({
            where: { id, restaurantId },
            data: { ...change, version: { increment: 1 } },
            include: taskInclude,
          }),
        recordEvent: this.eventWriter(tx, restaurantId, userId),
      });
    });
  }
  async history(
    restaurantId: string,
    taskId: string,
    page: number,
    pageSize: number,
    visibleToUserId?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const task = await tx.operatingTask.findFirst({
          where: {
            id: taskId,
            restaurantId,
            ...(visibleToUserId ? { assignedToUserId: visibleToUserId } : {}),
          },
          select: { id: true },
        });
        if (!task) return null;
        const where = { restaurantId, taskId };
        const [items, total] = await Promise.all([
          tx.operatingTaskEvent.findMany({
            where,
            orderBy: [{ version: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { recordedBy: { select: { id: true, name: true } } },
          }),
          tx.operatingTaskEvent.count({ where }),
        ]);
        return { items, total };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  private eventWriter(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    recordedByUserId: string,
  ): OperatingTaskLock['recordEvent'] {
    return async (task, action, wasOverdue, reason) => {
      const snapshot = operatingTaskSchema.omit({ isOverdue: true }).strip().parse(task);
      await tx.operatingTaskEvent.create({
        data: {
          restaurantId,
          taskId: task.id,
          recordedByUserId,
          action,
          version: task.version,
          snapshot,
          wasOverdue,
          reason,
          createdAt: new Date(),
        },
      });
    };
  }
}
