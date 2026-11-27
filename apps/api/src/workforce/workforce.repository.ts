import { Injectable } from '@nestjs/common';
import type {
  AvailabilityQuery,
  CreateStaffAvailability,
  CreateStaffShift,
  RequestStaffLeave,
  ShiftQuery,
  StaffLeaveQuery,
  WorkforceSnapshot,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';

import { roleAccessSelect } from '../common/auth/role-access';
import { PrismaService } from '../common/database/prisma.service';

const person = { id: true, name: true } as const;
const shiftInclude = {
  user: { select: { ...person, status: true } },
  createdBy: { select: person },
} satisfies Prisma.StaffShiftInclude;
const availabilityInclude = { user: { select: person } } satisfies Prisma.StaffAvailabilityInclude;
const leaveInclude = {
  user: { select: person },
  requestedBy: { select: person },
  reviewedBy: { select: person },
} satisfies Prisma.StaffLeaveInclude;
export type ShiftRecord = Prisma.StaffShiftGetPayload<{ include: typeof shiftInclude }>;
export type AvailabilityRecord = Prisma.StaffAvailabilityGetPayload<{
  include: typeof availabilityInclude;
}>;
export type LeaveRecord = Prisma.StaffLeaveGetPayload<{ include: typeof leaveInclude }>;
const interval = (query: {
  from?: string;
  to?: string;
}): { startsAt?: { lt: Date }; endsAt?: { gt: Date } } => ({
  ...(query.from ? { endsAt: { gt: new Date(query.from) } } : {}),
  ...(query.to ? { startsAt: { lt: new Date(query.to) } } : {}),
});

@Injectable()
export class WorkforceRepository {
  constructor(private readonly prisma: PrismaService) {}
  staff(restaurantId: string) {
    return this.prisma.user.findMany({
      where: { restaurantId, status: 'ACTIVE' },
      select: { ...person, role: { select: roleAccessSelect } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }
  withLockedWorkforce<T>(
    restaurantId: string,
    actorUserId: string,
    action: (context: WorkforceContext) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'workforce:' + restaurantId},0))`;
        return action(this.createContext(tx, restaurantId, actorUserId));
      },
      { timeout: 15000 },
    );
  }
  createContext(tx: Prisma.TransactionClient, restaurantId: string, actorUserId: string) {
    const scope = { restaurantId };
    return {
      staff: (id: string) =>
        tx.user.findFirst({
          where: { id, ...scope, status: 'ACTIVE' },
          select: { ...person, role: { select: roleAccessSelect } },
        }),
      shifts: {
        find: (id: string, visibleUserId?: string) =>
          tx.staffShift.findFirst({
            where: { id, ...scope, ...(visibleUserId ? { userId: visibleUserId } : {}) },
            include: shiftInclude,
          }),
        create: (input: CreateStaffShift) =>
          tx.staffShift.create({
            data: {
              ...input,
              ...scope,
              createdByUserId: actorUserId,
              startsAt: new Date(input.startsAt),
              endsAt: new Date(input.endsAt),
            },
            include: shiftInclude,
          }),
        update: (
          id: string,
          data: Partial<
            Pick<
              Prisma.StaffShiftUncheckedUpdateInput,
              'userId' | 'startsAt' | 'endsAt' | 'note' | 'status'
            >
          >,
        ) =>
          tx.staffShift.update({
            where: { id, ...scope },
            data: { ...data, version: { increment: 1 } },
            include: shiftInclude,
          }),
      },
      availability: {
        find: (id: string, visibleUserId?: string) =>
          tx.staffAvailability.findFirst({
            where: { id, ...scope, ...(visibleUserId ? { userId: visibleUserId } : {}) },
            include: availabilityInclude,
          }),
        create: (userId: string, input: CreateStaffAvailability) =>
          tx.staffAvailability.create({
            data: {
              ...input,
              ...scope,
              userId,
              startsAt: new Date(input.startsAt),
              endsAt: new Date(input.endsAt),
            },
            include: availabilityInclude,
          }),
        update: (
          id: string,
          data: Partial<
            Pick<
              Prisma.StaffAvailabilityUncheckedUpdateInput,
              'startsAt' | 'endsAt' | 'kind' | 'note' | 'isActive'
            >
          >,
        ) =>
          tx.staffAvailability.update({
            where: { id, ...scope },
            data: { ...data, version: { increment: 1 } },
            include: availabilityInclude,
          }),
      },
      leave: {
        find: (id: string, visibleUserId?: string) =>
          tx.staffLeave.findFirst({
            where: { id, ...scope, ...(visibleUserId ? { userId: visibleUserId } : {}) },
            include: leaveInclude,
          }),
        create: (userId: string, input: RequestStaffLeave) =>
          tx.staffLeave.create({
            data: {
              ...input,
              ...scope,
              userId,
              requestedByUserId: actorUserId,
              startsAt: new Date(input.startsAt),
              endsAt: new Date(input.endsAt),
            },
            include: leaveInclude,
          }),
        update: (
          id: string,
          data: Partial<
            Pick<
              Prisma.StaffLeaveUncheckedUpdateInput,
              'status' | 'reviewedByUserId' | 'reviewNote' | 'reviewedAt'
            >
          >,
        ) =>
          tx.staffLeave.update({
            where: { id, ...scope },
            data: { ...data, version: { increment: 1 } },
            include: leaveInclude,
          }),
      },
      facts: async (userIds: string[], startsAt: Date, endsAt: Date) => {
        const where = {
          ...scope,
          userId: { in: userIds },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        };
        const select = { id: true, userId: true, startsAt: true, endsAt: true } as const;
        const [shifts, unavailability, leave] = await Promise.all([
          tx.staffShift.findMany({ where: { ...where, status: 'SCHEDULED' }, select }),
          tx.staffAvailability.findMany({
            where: { ...where, isActive: true, kind: 'UNAVAILABLE' },
            select,
          }),
          tx.staffLeave.findMany({ where: { ...where, status: 'APPROVED' }, select }),
        ]);
        return { shifts, unavailability, leave };
      },
      record: async (snapshot: WorkforceSnapshot, action: string, reason?: string) => {
        await tx.workforceEvent.create({
          data: {
            ...scope,
            userId: snapshot.data.user.id,
            recordedByUserId: actorUserId,
            shiftId: snapshot.entity === 'SHIFT' ? snapshot.data.id : null,
            availabilityId: snapshot.entity === 'AVAILABILITY' ? snapshot.data.id : null,
            leaveId: snapshot.entity === 'LEAVE' ? snapshot.data.id : null,
            entityVersion: snapshot.data.version,
            action,
            snapshot,
            reason,
            createdAt: new Date(),
          },
        });
      },
    };
  }
  async shifts(restaurantId: string, query: ShiftQuery, visibleUserId?: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const where = {
          restaurantId,
          ...interval(query),
          ...(visibleUserId
            ? { userId: visibleUserId }
            : query.userId
              ? { userId: query.userId }
              : {}),
          ...(query.status ? { status: query.status } : {}),
        };
        const [items, total] = await Promise.all([
          tx.staffShift.findMany({
            where,
            include: shiftInclude,
            orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          }),
          tx.staffShift.count({ where }),
        ]);
        const facts = items.length
          ? await this.createContext(tx, restaurantId, '').facts(
              [...new Set(items.map((item) => item.userId))],
              new Date(Math.min(...items.map((item) => item.startsAt.getTime()))),
              new Date(Math.max(...items.map((item) => item.endsAt.getTime()))),
            )
          : { shifts: [], unavailability: [], leave: [] };
        return { items, total, facts };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async availability(restaurantId: string, query: AvailabilityQuery, visibleUserId?: string) {
    const where: Prisma.StaffAvailabilityWhereInput = {
      restaurantId,
      ...interval(query),
      ...(visibleUserId ? { userId: visibleUserId } : query.userId ? { userId: query.userId } : {}),
      ...(query.activeOnly === 'false' ? {} : { isActive: true }),
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.staffAvailability.findMany({
          where,
          include: availabilityInclude,
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.staffAvailability.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, total };
  }
  async leave(restaurantId: string, query: StaffLeaveQuery, visibleUserId?: string) {
    const where: Prisma.StaffLeaveWhereInput = {
      restaurantId,
      ...interval(query),
      ...(visibleUserId ? { userId: visibleUserId } : query.userId ? { userId: query.userId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.staffLeave.findMany({
          where,
          include: leaveInclude,
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.staffLeave.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, total };
  }
  async history(
    restaurantId: string,
    entity: WorkforceSnapshot['entity'],
    id: string,
    page: number,
    pageSize: number,
    visibleUserId?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const resource =
          entity === 'SHIFT'
            ? await tx.staffShift.findFirst({
                where: { id, restaurantId, ...(visibleUserId ? { userId: visibleUserId } : {}) },
                select: { id: true },
              })
            : entity === 'AVAILABILITY'
              ? await tx.staffAvailability.findFirst({
                  where: { id, restaurantId, ...(visibleUserId ? { userId: visibleUserId } : {}) },
                  select: { id: true },
                })
              : await tx.staffLeave.findFirst({
                  where: { id, restaurantId, ...(visibleUserId ? { userId: visibleUserId } : {}) },
                  select: { id: true },
                });
        if (!resource) return null;
        const where = {
          restaurantId,
          ...(entity === 'SHIFT'
            ? { shiftId: id }
            : entity === 'AVAILABILITY'
              ? { availabilityId: id }
              : { leaveId: id }),
        };
        const [items, total] = await Promise.all([
          tx.workforceEvent.findMany({
            where,
            include: { recordedBy: { select: person } },
            orderBy: [{ entityVersion: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          tx.workforceEvent.count({ where }),
        ]);
        return { items, total };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
export type WorkforceContext = ReturnType<WorkforceRepository['createContext']>;
export type WorkforceFacts = Awaited<ReturnType<WorkforceContext['facts']>>;
