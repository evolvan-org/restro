import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const diningSectionSelect = {
  id: true,
  name: true,
  description: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DiningSectionSelect;

export type DiningSectionRecord = Prisma.DiningSectionGetPayload<{
  select: typeof diningSectionSelect;
}>;

export type DiningSectionDetails = {
  name: string;
  description: string | null;
  sortOrder: number;
};

@Injectable()
export class DiningSectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(
    restaurantId: string,
    skip: number,
    take: number,
  ): Promise<{ items: DiningSectionRecord[]; total: number }> {
    const where: Prisma.DiningSectionWhereInput = { restaurantId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.diningSection.findMany({
        where,
        select: diningSectionSelect,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.diningSection.count({ where }),
    ]);

    return { items, total };
  }

  findById(restaurantId: string, sectionId: string): Promise<DiningSectionRecord | null> {
    return this.prisma.diningSection.findFirst({
      where: { id: sectionId, restaurantId },
      select: diningSectionSelect,
    });
  }

  async findIds(restaurantId: string): Promise<string[]> {
    const sections = await this.prisma.diningSection.findMany({
      where: { restaurantId },
      select: { id: true },
    });
    return sections.map(({ id }) => id);
  }

  async isNameTaken(
    restaurantId: string,
    name: string,
    excludeSectionId?: string,
  ): Promise<boolean> {
    const existing = await this.prisma.diningSection.findFirst({
      where: {
        restaurantId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeSectionId && { id: { not: excludeSectionId } }),
      },
      select: { id: true },
    });
    return existing !== null;
  }

  async nextSortOrder(restaurantId: string): Promise<number> {
    const result = await this.prisma.diningSection.aggregate({
      where: { restaurantId },
      _max: { sortOrder: true },
    });
    return (result._max.sortOrder ?? -1) + 1;
  }

  create(restaurantId: string, details: DiningSectionDetails): Promise<DiningSectionRecord> {
    return this.prisma.diningSection.create({
      data: { restaurantId, ...details },
      select: diningSectionSelect,
    });
  }

  async update(
    restaurantId: string,
    sectionId: string,
    details: DiningSectionDetails,
  ): Promise<DiningSectionRecord | null> {
    const { count } = await this.prisma.diningSection.updateMany({
      where: { id: sectionId, restaurantId },
      data: details,
    });
    return count === 0 ? null : this.findById(restaurantId, sectionId);
  }

  async updateStatus(
    restaurantId: string,
    sectionId: string,
    isActive: boolean,
  ): Promise<DiningSectionRecord | null> {
    const { count } = await this.prisma.diningSection.updateMany({
      where: { id: sectionId, restaurantId },
      data: { isActive },
    });
    return count === 0 ? null : this.findById(restaurantId, sectionId);
  }

  async reorder(restaurantId: string, orderedIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      orderedIds.map((id, sortOrder) =>
        this.prisma.diningSection.updateMany({
          where: { id, restaurantId },
          data: { sortOrder },
        }),
      ),
    );
  }
}
