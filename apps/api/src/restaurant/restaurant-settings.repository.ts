import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const restaurantSettingsSelect = {
  name: true,
  currency: true,
  timezone: true,
  gstNumber: true,
  defaultGstRate: true,
  maxDiscountPercent: true,
  address: true,
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
  maxDiscountPercent: number;
  address: string | null;
};

@Injectable()
export class RestaurantSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findLogo(
    restaurantId: string,
  ): Promise<{ mimeType: string | null; data: Uint8Array | null } | null> {
    return this.prisma.restaurantLogo.findUnique({
      where: { restaurantId },
      select: { mimeType: true, data: true },
    });
  }

  async saveLogo(
    restaurantId: string,
    mimeType: string | null,
    data: Uint8Array<ArrayBuffer> | null,
  ): Promise<void> {
    await this.prisma.restaurantLogo.upsert({
      where: { restaurantId },
      create: { restaurantId, mimeType, data },
      update: { mimeType, data },
    });
  }

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
