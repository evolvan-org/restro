import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const stateSelect = {
  name: true,
  currency: true,
  timezone: true,
  gstNumber: true,
  address: true,
  defaultGstRate: true,
  maxDiscountPercent: true,
  onboardingCompletedAt: true,
  onboardingDraft: {
    select: { currentStep: true, skippedSteps: true, data: true, version: true, updatedAt: true },
  },
} satisfies Prisma.RestaurantSelect;

export type OnboardingStateRecord = Prisma.RestaurantGetPayload<{ select: typeof stateSelect }>;

export type DraftWrite = {
  currentStep: number;
  skippedSteps: number[];
  data: Prisma.InputJsonValue;
};

export type SetupProgressRecord = {
  hasDetails: boolean;
  tables: number;
  menuItems: number;
  stockItems: number;
  teamMembers: number;
  missingRecipes: number;
};

@Injectable()
export class OnboardingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findState(restaurantId: string): Promise<OnboardingStateRecord> {
    return this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: stateSelect,
    });
  }

  /**
   * Saves the draft only if it is still at `expectedVersion`; returns null when another tab or
   * device saved first. Version 0 means "no draft yet" (a tenant provisioned before drafts existed).
   */
  async saveDraft(
    restaurantId: string,
    expectedVersion: number,
    draft: DraftWrite,
  ): Promise<{ version: number; updatedAt: Date } | null> {
    if (expectedVersion === 0) {
      try {
        return await this.prisma.onboardingDraft.create({
          data: { restaurantId, ...draft },
          select: { version: true, updatedAt: true },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return null;
        }
        throw error;
      }
    }

    const { count } = await this.prisma.onboardingDraft.updateMany({
      where: { restaurantId, version: expectedVersion },
      data: { ...draft, version: { increment: 1 } },
    });
    if (count === 0) return null;
    return this.prisma.onboardingDraft.findUniqueOrThrow({
      where: { restaurantId },
      select: { version: true, updatedAt: true },
    });
  }

  async findName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true },
    });
    return user.name;
  }

  /** Emails are globally unique across tenants. */
  async takenEmails(emails: readonly string[]): Promise<string[]> {
    if (!emails.length) return [];
    const users = await this.prisma.user.findMany({
      where: { OR: emails.map((email) => ({ email: { equals: email, mode: 'insensitive' } })) },
      select: { email: true },
    });
    return users.map(({ email }) => email.toLowerCase());
  }

  async setupProgress(restaurantId: string): Promise<SetupProgressRecord> {
    const [restaurant, tables, menuItems, stockItems, teamMembers, missingRecipes] =
      await this.prisma.$transaction([
        this.prisma.restaurant.findUniqueOrThrow({
          where: { id: restaurantId },
          select: { address: true, gstNumber: true },
        }),
        this.prisma.restaurantTable.count({ where: { restaurantId, isActive: true } }),
        this.prisma.menuItem.count({ where: { restaurantId, isActive: true } }),
        this.prisma.stockItem.count({ where: { restaurantId, isActive: true } }),
        this.prisma.user.count({ where: { restaurantId, role: { isOwner: false } } }),
        this.prisma.menuItem.count({
          where: { restaurantId, isActive: true, recipeRequired: true, recipeItems: { none: {} } },
        }),
      ]);
    return {
      hasDetails: restaurant.address !== null || restaurant.gstNumber !== null,
      tables,
      menuItems,
      stockItems,
      teamMembers,
      missingRecipes,
    };
  }
}
