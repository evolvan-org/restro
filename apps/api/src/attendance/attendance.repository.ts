import { Injectable } from '@nestjs/common';
import type {
  AttendanceCorrectionQuery,
  AttendanceQuery,
  AttendanceTimeline,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const personSelect = { id: true, name: true } as const;
const correctionInclude = {
  user: { select: personSelect },
  requestedBy: { select: personSelect },
  reviewedBy: { select: personSelect },
} satisfies Prisma.AttendanceCorrectionInclude;
export const sessionInclude = {
  user: { select: personSelect },
  breaks: { orderBy: [{ startedAt: 'asc' }, { id: 'asc' }] },
  appliedCorrection: { select: { timeline: true } },
} satisfies Prisma.AttendanceSessionInclude;
export type AttendanceRecord = Prisma.AttendanceSessionGetPayload<{
  include: typeof sessionInclude;
}>;
export type CorrectionRecord = Prisma.AttendanceCorrectionGetPayload<{
  include: typeof correctionInclude;
}>;
type EventInput = {
  createdAt?: Date;
  recordedByUserId: string;
  action: string;
  note: string;
  correctionId?: string;
  deviceLabel?: string;
  locationLabel?: string;
  userAgent?: string | null;
};
export type AttendanceLock = {
  userExists: boolean;
  session: AttendanceRecord | null;
  create: (clockInAt: Date) => Promise<AttendanceRecord>;
  update: (input: { clockOutAt?: Date; appliedCorrectionId?: string }) => Promise<AttendanceRecord>;
  startBreak: (at: Date) => Promise<AttendanceRecord>;
  endBreak: (id: string, at: Date) => Promise<AttendanceRecord>;
  event: (sessionId: string, input: EventInput) => Promise<void>;
  pendingCorrection: () => Promise<CorrectionRecord | null>;
  createCorrection: (input: {
    requestedByUserId: string;
    reason: string;
    timeline: AttendanceTimeline;
    originalTimeline: AttendanceTimeline;
    baseSessionVersion: number;
  }) => Promise<CorrectionRecord>;
  findCorrection: (id: string) => Promise<CorrectionRecord | null>;
  reviewCorrection: (
    id: string,
    input: {
      status: 'APPROVED' | 'REJECTED';
      reviewNote: string;
      reviewedByUserId: string;
      reviewedAt: Date;
    },
  ) => Promise<CorrectionRecord>;
  overlappingSession: (timeline: AttendanceTimeline) => Promise<{ id: string } | null>;
};

@Injectable()
export class AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}
  current(restaurantId: string, userId: string): Promise<AttendanceRecord | null> {
    return this.prisma.attendanceSession.findFirst({
      where: { restaurantId, userId, clockOutAt: null },
      include: sessionInclude,
    });
  }
  subject(restaurantId: string, id: string, visibleToUserId?: string) {
    return this.prisma.attendanceSession.findFirst({
      where: { id, restaurantId, ...(visibleToUserId ? { userId: visibleToUserId } : {}) },
      select: { userId: true },
    });
  }
  correctionSubject(restaurantId: string, id: string) {
    return this.prisma.attendanceCorrection.findFirst({
      where: { id, restaurantId },
      select: { userId: true, sessionId: true },
    });
  }
  async list(restaurantId: string, query: AttendanceQuery, visibleToUserId?: string) {
    const where: Prisma.AttendanceSessionWhereInput = {
      restaurantId,
      ...(visibleToUserId
        ? { userId: visibleToUserId }
        : query.userId
          ? { userId: query.userId }
          : {}),
      ...(query.openOnly === 'true' ? { clockOutAt: null } : {}),
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.attendanceSession.findMany({
          where,
          include: sessionInclude,
          orderBy: [{ clockInAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.attendanceSession.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, total };
  }
  async corrections(
    restaurantId: string,
    query: AttendanceCorrectionQuery,
    visibleToUserId?: string,
  ) {
    const where: Prisma.AttendanceCorrectionWhereInput = {
      restaurantId,
      ...(visibleToUserId ? { userId: visibleToUserId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.attendanceCorrection.findMany({
          where,
          include: correctionInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.attendanceCorrection.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, total };
  }
  withLockedAttendance<T>(
    restaurantId: string,
    userId: string,
    sessionId: string | undefined,
    action: (context: AttendanceLock) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const users = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM users WHERE id=${userId}::uuid AND restaurant_id=${restaurantId}::uuid FOR UPDATE`;
        if (sessionId)
          await tx.$queryRaw`SELECT id FROM attendance_sessions WHERE id=${sessionId}::uuid AND restaurant_id=${restaurantId}::uuid AND user_id=${userId}::uuid FOR UPDATE`;
        const session = await tx.attendanceSession.findFirst({
          where: {
            restaurantId,
            userId,
            ...(sessionId ? { id: sessionId } : { clockOutAt: null }),
          },
          include: sessionInclude,
        });
        const id = session?.id;
        const update = (input: {
          clockOutAt?: Date;
          appliedCorrectionId?: string;
        }): Promise<AttendanceRecord> =>
          tx.attendanceSession.update({
            where: { id: id ?? '', restaurantId, userId },
            data: { ...input, version: { increment: 1 } },
            include: sessionInclude,
          });
        return action({
          userExists: users.length > 0,
          session,
          create: (clockInAt) =>
            tx.attendanceSession.create({
              data: { restaurantId, userId, clockInAt },
              include: sessionInclude,
            }),
          update,
          startBreak: async (startedAt) => {
            await tx.attendanceBreak.create({ data: { sessionId: id ?? '', startedAt } });
            return update({});
          },
          endBreak: async (breakId, endedAt) => {
            await tx.attendanceBreak.update({
              where: { id: breakId, sessionId: id, session: { restaurantId, userId } },
              data: { endedAt },
            });
            return update({});
          },
          event: async (eventSessionId, input) => {
            await tx.attendanceEvent.create({
              data: {
                ...input,
                restaurantId,
                sessionId: eventSessionId,
                createdAt: input.createdAt ?? new Date(),
              },
            });
          },
          pendingCorrection: () =>
            tx.attendanceCorrection.findFirst({
              where: { restaurantId, sessionId: id, status: 'PENDING' },
              include: correctionInclude,
            }),
          createCorrection: (input) =>
            tx.attendanceCorrection.create({
              data: {
                ...input,
                restaurantId,
                userId,
                sessionId: id ?? '',
                timeline: input.timeline,
                createdAt: new Date(),
              },
              include: correctionInclude,
            }),
          findCorrection: (correctionId) =>
            tx.attendanceCorrection.findFirst({
              where: { id: correctionId, restaurantId, sessionId: id },
              include: correctionInclude,
            }),
          reviewCorrection: (correctionId, input) =>
            tx.attendanceCorrection.update({
              where: { id: correctionId, restaurantId, sessionId: id },
              data: { ...input, version: { increment: 1 } },
              include: correctionInclude,
            }),
          overlappingSession: async (timeline) => {
            const [other] = await tx.$queryRaw<{ id: string }[]>`
            SELECT s.id FROM attendance_sessions s
            LEFT JOIN attendance_corrections c ON c.id=s.applied_correction_id AND c.restaurant_id=s.restaurant_id
            WHERE s.restaurant_id=${restaurantId}::uuid AND s.user_id=${userId}::uuid AND s.id<>${id ?? null}::uuid
              AND COALESCE((c.timeline->>'clockInAt')::timestamptz,s.clock_in_at)<${new Date(timeline.clockOutAt)}
              AND COALESCE((c.timeline->>'clockOutAt')::timestamptz,s.clock_out_at,clock_timestamp())>${new Date(timeline.clockInAt)}
            LIMIT 1`;
            return other ?? null;
          },
        });
      },
      { timeout: 15000 },
    );
  }
  async history(
    restaurantId: string,
    sessionId: string,
    page: number,
    pageSize: number,
    visibleToUserId?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const session = await tx.attendanceSession.findFirst({
          where: {
            id: sessionId,
            restaurantId,
            ...(visibleToUserId ? { userId: visibleToUserId } : {}),
          },
          select: { id: true },
        });
        if (!session) return null;
        const where = { restaurantId, sessionId };
        const [items, total] = await Promise.all([
          tx.attendanceEvent.findMany({
            where,
            include: { recordedBy: { select: personSelect } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          tx.attendanceEvent.count({ where }),
        ]);
        return { items, total };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
