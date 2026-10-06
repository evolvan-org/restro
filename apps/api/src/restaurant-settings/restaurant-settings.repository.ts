import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const restaurantSettingsSelect = {
  name: true,
  currency: true,
  timezone: true,
  gstNumber: true,
  defaultGstRate: true,
} satisfies Prisma.RestaurantSelect;

export type RestaurantSettingsRecord = Prisma.RestaurantGetPayload<{
  select: typeof restaurantSettingsSelect;
}>;

export type RestaurantSettingsDetails = {
  name: string;
  currency: string;
  timezone: string;
  gstNumber: string | null;
  defaultGstRate: number;
};

@Injectable()
export class RestaurantSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(restaurantId: string): Promise<RestaurantSettingsRecord | null> {
    return this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: restaurantSettingsSelect,
    });
  }

  async update(
    restaurantId: string,
    details: RestaurantSettingsDetails,
  ): Promise<RestaurantSettingsRecord | null> {
    try {
      return await this.prisma.restaurant.update({
        where: { id: restaurantId },
        data: details,
        select: restaurantSettingsSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }
}
