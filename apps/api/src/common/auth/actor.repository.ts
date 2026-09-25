import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';
import { PrismaService } from '../database/prisma.service';

const actorSelect = {
  restaurantId: true,
  status: true,
  role: {
    select: {
      name: true,
    },
  },
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
}
