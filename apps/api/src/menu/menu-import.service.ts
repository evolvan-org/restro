import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  type BulkImportMenuItemsRequest,
  type BulkImportMenuItemsResponse,
  portionFactorForVariant,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';

import { AiJobsService } from '../ai/jobs/ai-jobs.service';
import type { Actor } from '../common/auth/authenticated-request';
import { PrismaService } from '../common/database/prisma.service';

const key = (value: string): string => value.trim().toLowerCase();

/**
 * "Import from photo" after setup: reviewed rows become live menu items in one transaction.
 * Rows whose name already exists in that category (live menu or earlier in the import) are left
 * out and reported, never overwritten.
 */
@Injectable()
export class MenuImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scans: AiJobsService,
  ) {}

  async import(
    actor: Actor,
    input: BulkImportMenuItemsRequest,
  ): Promise<BulkImportMenuItemsResponse> {
    const { restaurantId } = actor;
    const result = await this.prisma.$transaction(
      async (tx) => {
        const categories = await tx.menuCategory.findMany({
          where: { restaurantId },
          select: { id: true, name: true, sortOrder: true },
        });
        const categoryIds = new Map(
          categories.map((category) => [key(category.name), category.id]),
        );
        let nextSort = Math.max(-1, ...categories.map((category) => category.sortOrder)) + 1;

        const live = await tx.menuItem.findMany({
          where: { restaurantId },
          select: { name: true, categoryId: true },
        });
        const taken = new Set(live.map((item) => `${item.categoryId}\u0000${key(item.name)}`));

        let categoriesCreated = 0;
        const skippedDuplicates: BulkImportMenuItemsResponse['skippedDuplicates'] = [];
        const items: Prisma.MenuItemCreateManyInput[] = [];
        const variants: Prisma.MenuItemVariantCreateManyInput[] = [];

        for (const row of input.rows) {
          let categoryId = categoryIds.get(key(row.category));
          if (!categoryId) {
            const created = await tx.menuCategory.create({
              data: {
                restaurantId,
                name: row.category.trim(),
                categoryType: row.itemType,
                sortOrder: nextSort++,
              },
              select: { id: true },
            });
            categoryId = created.id;
            categoryIds.set(key(row.category), categoryId);
            categoriesCreated += 1;
          }
          const slot = `${categoryId}\u0000${key(row.name)}`;
          if (taken.has(slot)) {
            skippedDuplicates.push({ name: row.name, category: row.category });
            continue;
          }
          taken.add(slot);
          const id = randomUUID();
          const prices = row.variants?.map((variant) => Number(variant.price)) ?? [];
          items.push({
            id,
            restaurantId,
            categoryId,
            name: row.name.trim(),
            description: row.description?.trim() || null,
            price: new Prisma.Decimal(prices.length ? String(Math.max(...prices)) : row.price),
            itemType: row.itemType,
            dietType: row.dietType ?? null,
          });
          row.variants?.forEach((variant, sortOrder) =>
            variants.push({
              restaurantId,
              menuItemId: id,
              name: variant.name,
              price: new Prisma.Decimal(variant.price),
              portionFactor: new Prisma.Decimal(
                variant.portionFactor ?? portionFactorForVariant(variant.name),
              ),
              sortOrder,
            }),
          );
        }
        if (items.length) await tx.menuItem.createMany({ data: items });
        if (variants.length) await tx.menuItemVariant.createMany({ data: variants });
        return { created: items.length, categoriesCreated, skippedDuplicates };
      },
      { timeout: 30_000 },
    );
    if (input.scanJobId) await this.scans.purgeAfterUse(restaurantId, [input.scanJobId]);
    return result;
  }
}
