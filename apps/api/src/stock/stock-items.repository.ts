import { Injectable } from '@nestjs/common';
import type { Prisma, StockItem } from '@rms/db';

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
  /** Active ingredients among `stockItemIds`, with the base unit their recipes must measure in. */
  findActiveBaseUnits(
    restaurantId: string,
    stockItemIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string; baseUnit: StockItem['baseUnit'] }[]> {
    return tx.stockItem.findMany({
      where: { restaurantId, isActive: true, id: { in: stockItemIds } },
      select: { id: true, baseUnit: true },
    });
  }
}
