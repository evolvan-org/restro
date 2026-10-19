import { Injectable } from '@nestjs/common';

import { PrismaService } from '../common/database/prisma.service';

export type StockItemRecord = { id: string; name: string };

@Injectable()
export class StockItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive(restaurantId: string): Promise<StockItemRecord[]> {
    return this.prisma.stockItem.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  /** Ids from `stockItemIds` that are active ingredients of this restaurant's master. */
  async findActiveIds(restaurantId: string, stockItemIds: string[]): Promise<string[]> {
    const rows = await this.prisma.stockItem.findMany({
      where: { restaurantId, isActive: true, id: { in: stockItemIds } },
      select: { id: true },
    });
    return rows.map(({ id }) => id);
  }
}
