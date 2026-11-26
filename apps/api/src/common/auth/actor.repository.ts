import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { PrismaService } from '../database/prisma.service';
import { roleAccessSelect } from './role-access';

const actorSelect = {
  restaurantId: true,
  roleId: true,
  status: true,
  authVersion: true,
  emailVerifiedAt: true,
  mustChangePassword: true,
  lastSeenAt: true,
  restaurant: { select: { onboardingCompletedAt: true } },
  role: { select: roleAccessSelect },
} satisfies Prisma.UserSelect;

export type ActorRecord = Prisma.UserGetPayload<{ select: typeof actorSelect }>;

@Injectable()
export class ActorRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(userId: string): Promise<ActorRecord | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: actorSelect,
    });
  }

  /** Conditional write so concurrent requests from one user cost at most one update a minute. */
  async touchLastSeen(userId: string, now: Date): Promise<void> {
    await this.prisma.user.updateMany({
      where: {
        id: userId,
        OR: [
          { lastSeenAt: null },
          { lastSeenAt: { lt: new Date(now.getTime() - LAST_SEEN_THROTTLE_MS) } },
        ],
      },
      data: { lastSeenAt: now },
    });
  }
}

/** How often `users.last_seen_at` is refreshed by authenticated traffic. */
export const LAST_SEEN_THROTTLE_MS = 60_000;
