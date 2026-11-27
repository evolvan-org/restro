import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AttendanceAction,
  type AttendanceCorrection,
  type AttendanceCorrectionList,
  type AttendanceCorrectionQuery,
  attendanceEventSchema,
  type AttendanceHistory,
  type AttendanceList,
  type AttendanceQuery,
  type AttendanceSession,
  type AttendanceTimeline,
  attendanceTimelineSchema,
  type CurrentAttendance,
  type DecideAttendanceCorrection,
  type RequestAttendanceCorrection,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { buildPageMeta } from '@rms/shared';

import { actorCan } from '../common/auth/actor-permissions';
import type { Actor } from '../common/auth/authenticated-request';
import { toAttendanceCorrection, toAttendanceSession } from './attendance.mapper';
import { type AttendanceLock, AttendanceRepository } from './attendance.repository';

@Injectable()
export class AttendanceService {
  constructor(private readonly repository: AttendanceRepository) {}
  async current(actor: Actor): Promise<CurrentAttendance> {
    const record = await this.repository.current(actor.restaurantId, actor.userId);
    const now = new Date();
    return { data: record ? toAttendanceSession(record, now) : null, asOf: now.toISOString() };
  }
  async list(actor: Actor, query: AttendanceQuery): Promise<AttendanceList> {
    const result = await this.repository.list(actor.restaurantId, query, this.visibility(actor));
    const now = new Date();
    return {
      data: result.items.map((record) => toAttendanceSession(record, now)),
      meta: buildPageMeta(query.page, query.pageSize, result.total),
    };
  }
  async act(
    actor: Actor,
    input: AttendanceAction,
    userAgent: string | null,
  ): Promise<AttendanceSession> {
    return this.repository.withLockedAttendance(
      actor.restaurantId,
      actor.userId,
      input.action === 'CLOCK_IN' ? undefined : input.sessionId,
      async (context) => {
        if (!context.userExists) throw new NotFoundException('Staff member not found');
        const now = new Date();
        let updated;
        if (input.action === 'CLOCK_IN') {
          if (context.session) throw new ConflictException('You are already clocked in');
          updated = await context.create(now);
        } else {
          const session = this.currentSession(context, input.expectedVersion);
          if (session.clockOutAt)
            throw new ConflictException('This attendance session is already closed');
          const openBreak = session.breaks.find((entry) => entry.endedAt === null);
          if (input.action === 'BREAK_START') {
            if (openBreak) throw new ConflictException('A break is already open');
            updated = await context.startBreak(now);
          } else if (input.action === 'BREAK_END') {
            if (!openBreak) throw new ConflictException('No break is open');
            updated = await context.endBreak(openBreak.id, now);
          } else {
            if (openBreak) throw new ConflictException('End the open break before clocking out');
            updated = await context.update({ clockOutAt: now });
          }
        }
        await context.event(updated.id, {
          action: input.action,
          recordedByUserId: actor.userId,
          deviceLabel: input.deviceLabel,
          locationLabel: input.locationLabel,
          userAgent: userAgent?.slice(0, 1000) ?? null,
          note: input.note,
          createdAt: now,
        });
        return toAttendanceSession(updated, now);
      },
    );
  }
  async requestCorrection(
    actor: Actor,
    sessionId: string,
    input: RequestAttendanceCorrection,
  ): Promise<AttendanceCorrection> {
    const subject = await this.repository.subject(
      actor.restaurantId,
      sessionId,
      this.visibility(actor),
    );
    if (!subject) throw new NotFoundException('Attendance session not found');
    return this.repository.withLockedAttendance(
      actor.restaurantId,
      subject.userId,
      sessionId,
      async (context) => {
        const session = this.currentSession(context, input.expectedVersion);
        if (!session.clockOutAt)
          throw new ConflictException('Close the session before requesting a correction');
        if (await context.pendingCorrection())
          throw new ConflictException('A correction is already awaiting review for this session');
        const timeline = await this.validateTimeline(context, input.timeline);
        const correction = await context.createCorrection({
          requestedByUserId: actor.userId,
          reason: input.reason,
          timeline,
          originalTimeline: session.appliedCorrection
            ? attendanceTimelineSchema.parse(session.appliedCorrection.timeline)
            : {
                clockInAt: session.clockInAt.toISOString(),
                clockOutAt: session.clockOutAt.toISOString(),
                breaks: session.breaks.map((entry) => {
                  if (!entry.endedAt)
                    throw new ConflictException('The closed session has an unfinished break');
                  return {
                    startedAt: entry.startedAt.toISOString(),
                    endedAt: entry.endedAt.toISOString(),
                  };
                }),
              },
          baseSessionVersion: session.version,
        });
        await context.event(session.id, {
          action: 'CORRECTION_REQUESTED',
          recordedByUserId: actor.userId,
          correctionId: correction.id,
          note: input.reason,
        });
        return toAttendanceCorrection(correction);
      },
    );
  }
  async corrections(
    actor: Actor,
    query: AttendanceCorrectionQuery,
  ): Promise<AttendanceCorrectionList> {
    const maySeeAll =
      actorCan(actor, Permission.ATTENDANCE_APPROVE) ||
      actorCan(actor, Permission.WORKFORCE_MANAGE);
    const result = await this.repository.corrections(
      actor.restaurantId,
      query,
      maySeeAll ? undefined : actor.userId,
    );
    return {
      data: result.items.map(toAttendanceCorrection),
      meta: buildPageMeta(query.page, query.pageSize, result.total),
    };
  }
  async decideCorrection(
    actor: Actor,
    id: string,
    input: DecideAttendanceCorrection,
  ): Promise<AttendanceCorrection> {
    const subject = await this.repository.correctionSubject(actor.restaurantId, id);
    if (!subject) throw new NotFoundException('Correction not found');
    return this.repository.withLockedAttendance(
      actor.restaurantId,
      subject.userId,
      subject.sessionId,
      async (context) => {
        const correction = await context.findCorrection(id);
        if (!correction || !context.session) throw new NotFoundException('Correction not found');
        if (correction.status !== 'PENDING' || correction.version !== input.expectedVersion)
          throw new ConflictException('This correction was already reviewed or changed');
        if (input.decision === 'APPROVED') {
          if (context.session.version !== correction.baseSessionVersion)
            throw new ConflictException(
              'The attendance session changed. Reject this request and submit a fresh correction.',
            );
          await this.validateTimeline(context, attendanceTimelineSchema.parse(correction.timeline));
          await context.update({ appliedCorrectionId: id });
        }
        const updated = await context.reviewCorrection(id, {
          status: input.decision,
          reviewNote: input.reviewNote,
          reviewedByUserId: actor.userId,
          reviewedAt: new Date(),
        });
        await context.event(subject.sessionId, {
          action: input.decision === 'APPROVED' ? 'CORRECTION_APPROVED' : 'CORRECTION_REJECTED',
          recordedByUserId: actor.userId,
          correctionId: id,
          note: input.reviewNote,
        });
        return toAttendanceCorrection(updated);
      },
    );
  }
  async history(
    actor: Actor,
    id: string,
    page: number,
    pageSize: number,
  ): Promise<AttendanceHistory> {
    const mayReview = actorCan(actor, Permission.ATTENDANCE_APPROVE);
    const result = await this.repository.history(
      actor.restaurantId,
      id,
      page,
      pageSize,
      mayReview ? undefined : this.visibility(actor),
    );
    if (!result) throw new NotFoundException('Attendance session not found');
    return {
      data: result.items.map((event) =>
        attendanceEventSchema.parse({
          id: event.id,
          action: event.action,
          recordedBy: event.recordedBy,
          deviceLabel: event.deviceLabel,
          locationLabel: event.locationLabel,
          userAgent: event.userAgent,
          note: event.note,
          correctionId: event.correctionId,
          createdAt: event.createdAt.toISOString(),
        }),
      ),
      meta: buildPageMeta(page, pageSize, result.total),
    };
  }
  private visibility(actor: Actor): string | undefined {
    return actorCan(actor, Permission.WORKFORCE_MANAGE) ? undefined : actor.userId;
  }
  private currentSession(context: AttendanceLock, version: number) {
    if (!context.session) throw new NotFoundException('Attendance session not found');
    if (context.session.version !== version)
      throw new ConflictException('This session changed. Refresh and try again.');
    return context.session;
  }
  private async validateTimeline(
    context: AttendanceLock,
    input: AttendanceTimeline,
  ): Promise<AttendanceTimeline> {
    const timeline = attendanceTimelineSchema.parse(input);
    if (Date.parse(timeline.clockOutAt) > Date.now())
      throw new BadRequestException('Attendance corrections cannot record future work');
    if (await context.overlappingSession(timeline))
      throw new ConflictException('The corrected times overlap another attendance session');
    return {
      ...timeline,
      breaks: [...timeline.breaks].sort(
        (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
      ),
    };
  }
}
