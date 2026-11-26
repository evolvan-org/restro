import { randomUUID } from 'node:crypto';

import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  API_ERROR_CODES,
  baseUnitOf,
  type CompleteOnboardingData,
  type CompleteOnboardingDetails,
  effectiveMenuRowPrice,
  includedMenuRows,
  type OnboardingStage,
  portionFactorForVariant,
  summarizeMenuCategories,
  tableStatusCodeFromName,
  type Unit,
} from '@rms/api-contract';
import {
  BILL_CANCELLATION_REASONS,
  type InventoryBaseUnit,
  Prisma,
  type ServingType,
  SYSTEM_TABLE_STATUSES,
} from '@rms/db';
import type { Role } from '@rms/permissions';

import { PrismaService } from '../common/database/prisma.service';
import { InventoryService } from '../stock/inventory.service';

/** Bulk inserts comfortably fit; the default 5s does not for 500 menu items. */
const COMPLETE_TIMEOUT_MS = 30_000;
const OPENING_STOCK_REASON = 'Opening stock';

export type TeamAccount = {
  name: string;
  email: string;
  role: Exclude<Role, 'OWNER'>;
};

export type CompletionInput = {
  restaurantId: string;
  ownerId: string;
  details?: CompleteOnboardingDetails;
  floor?: NonNullable<CompleteOnboardingData['floor']>;
  menu?: NonNullable<CompleteOnboardingData['menu']>;
  recipes?: NonNullable<CompleteOnboardingData['recipes']>;
  inventory?: NonNullable<CompleteOnboardingData['inventory']>;
  team: readonly TeamAccount[];
};

export type CompletionResult = {
  restaurantName: string;
  counts: {
    sections: number;
    tables: number;
    customStatuses: number;
    menuCategories: number;
    menuItems: number;
    stockItems: number;
    openingStock: number;
    menuVariants: number;
    recipes: number;
    teamMembers: number;
  };
  users: { id: string; email: string }[];
};

/** A failure inside the finish transaction, tagged with the stage that was running. */
export class OnboardingStageFailure extends Error {
  constructor(
    readonly stage: OnboardingStage,
    override readonly cause: unknown,
  ) {
    super(`Onboarding failed at stage ${stage}`);
    this.name = 'OnboardingStageFailure';
  }
}

/**
 * Writes a finished onboarding draft into the business tables in one interactive transaction, in
 * the order the tables depend on each other. Any failure rolls everything back and is reported
 * with the stage that was running, so the owner can fix that step and retry.
 */
@Injectable()
export class OnboardingCompletionWriter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async complete(input: CompletionInput): Promise<CompletionResult> {
    let stage: OnboardingStage = 'details';
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const restaurant = await this.lockPendingRestaurant(tx, input.restaurantId);
          const counts: CompletionResult['counts'] = {
            sections: 0,
            tables: 0,
            customStatuses: 0,
            menuCategories: 0,
            menuItems: 0,
            stockItems: 0,
            openingStock: 0,
            menuVariants: 0,
            recipes: 0,
            teamMembers: 0,
          };
          // Menu row key → created item id, so recipes can attach after inventory exists.
          let menuItemIds = new Map<string, string>();

          stage = 'details';
          const restaurantName = input.details
            ? await this.writeDetails(tx, input.restaurantId, input.details)
            : restaurant.name;

          // Statuses go in before tables need one, but they are their own stage for the owner.
          stage = 'statuses';
          const availableStatusId = await this.ensureSystemStatuses(tx, input.restaurantId);

          if (input.floor) {
            stage = 'floor';
            Object.assign(counts, await this.writeFloor(tx, input, availableStatusId));
            stage = 'statuses';
            counts.customStatuses = await this.writeCustomStatuses(tx, input);
          }
          await this.writeCancellationReasons(tx, input);

          if (input.menu && input.menu.mode !== 'later' && input.menu.rows.length) {
            stage = 'menu';
            const menu = await this.writeMenu(tx, input.restaurantId, input.menu);
            menuItemIds = menu.itemIds;
            counts.menuCategories = menu.menuCategories;
            counts.menuItems = menu.menuItems;
            counts.menuVariants = menu.menuVariants;
          }

          if (input.inventory?.rows.length) {
            stage = 'inventory';
            const result = await this.writeInventory(tx, input);
            counts.stockItems = result.created;
            counts.openingStock = result.opened;
          }

          // Recipes reference stock items, so they go in after inventory.
          if (input.recipes && menuItemIds.size) {
            stage = 'recipes';
            const result = await this.writeRecipes(tx, input, menuItemIds);
            counts.recipes = result.recipes;
            counts.stockItems += result.stockItemsCreated;
          }

          stage = 'team';
          const users = await this.writeTeam(tx, input.restaurantId, input.team);
          counts.teamMembers = users.length;

          stage = 'final';
          await tx.restaurant.update({
            where: { id: input.restaurantId },
            data: { onboardingCompletedAt: new Date() },
          });
          await tx.onboardingDraft.deleteMany({ where: { restaurantId: input.restaurantId } });

          return { restaurantName, counts, users };
        },
        { timeout: COMPLETE_TIMEOUT_MS, maxWait: 10_000 },
      );
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new OnboardingStageFailure(stage, error);
    }
  }

  /** Row lock so two concurrent finishes can't both pass the "still pending" check. */
  private async lockPendingRestaurant(
    tx: Prisma.TransactionClient,
    restaurantId: string,
  ): Promise<{ name: string }> {
    const [row] = await tx.$queryRaw<{ name: string; onboarding_completed_at: Date | null }[]>`
      SELECT name, onboarding_completed_at FROM restaurants WHERE id = ${restaurantId}::uuid FOR UPDATE
    `;
    if (!row || row.onboarding_completed_at !== null) {
      throw new ConflictException({
        message: 'Setup is already finished.',
        error: 'Conflict',
        code: API_ERROR_CODES.ONBOARDING_ALREADY_COMPLETED,
      });
    }
    return { name: row.name };
  }

  private async writeDetails(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    details: CompleteOnboardingDetails,
  ): Promise<string> {
    const updated = await tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        name: details.name,
        address: details.address,
        gstNumber: details.gstNumber,
        defaultGstRate: details.defaultGstRate,
        maxDiscountPercent: details.maxDiscountPercent,
        currency: details.currency,
        timezone: details.timezone,
      },
      select: { name: true },
    });
    return updated.name;
  }

  /** Signup seeds these already; re-asserting them keeps finish safe for older tenants. */
  private async ensureSystemStatuses(
    tx: Prisma.TransactionClient,
    restaurantId: string,
  ): Promise<string> {
    await tx.tableStatus.createMany({
      data: SYSTEM_TABLE_STATUSES.map((status, sortOrder) => ({
        ...status,
        restaurantId,
        sortOrder,
        isSystem: true,
      })),
      skipDuplicates: true,
    });
    const available = await tx.tableStatus.findUniqueOrThrow({
      where: { restaurantId_code: { restaurantId, code: 'AVAILABLE' } },
      select: { id: true },
    });
    return available.id;
  }

  private async writeFloor(
    tx: Prisma.TransactionClient,
    input: CompletionInput,
    availableStatusId: string,
  ): Promise<Pick<CompletionResult['counts'], 'sections' | 'tables'>> {
    const sections = input.floor?.sections ?? [];
    let tables = 0;
    for (const [sortOrder, section] of sections.entries()) {
      const created = await tx.diningSection.create({
        data: { restaurantId: input.restaurantId, name: section.name, sortOrder },
        select: { id: true },
      });
      const result = await tx.restaurantTable.createMany({
        data: section.tables.map((table) => ({
          restaurantId: input.restaurantId,
          sectionId: created.id,
          currentStatusId: availableStatusId,
          tableNumber: table.number,
          capacity: table.capacity,
        })),
      });
      tables += result.count;
    }
    return { sections: sections.length, tables };
  }

  private async writeCustomStatuses(
    tx: Prisma.TransactionClient,
    input: CompletionInput,
  ): Promise<number> {
    const statuses = input.floor?.customStatuses ?? [];
    if (!statuses.length) return 0;
    const result = await tx.tableStatus.createMany({
      data: statuses.map((status, index) => ({
        restaurantId: input.restaurantId,
        code: tableStatusCodeFromName(status.name),
        name: status.name,
        sortOrder: SYSTEM_TABLE_STATUSES.length + index,
      })),
    });
    return result.count;
  }

  /**
   * The defaults always exist; an edited list renames or retires them and adds custom ones. Bills
   * store the reason text, so retiring a default never touches history.
   */
  private async writeCancellationReasons(
    tx: Prisma.TransactionClient,
    input: CompletionInput,
  ): Promise<void> {
    const { restaurantId } = input;
    await tx.billCancellationReason.createMany({
      data: BILL_CANCELLATION_REASONS.map((reason, sortOrder) => ({
        ...reason,
        restaurantId,
        sortOrder,
      })),
      skipDuplicates: true,
    });
    const edited = input.floor?.cancellationReasons;
    if (!edited) return;

    const kept = new Set(edited.flatMap((reason) => (reason.code ? [reason.code] : [])));
    await tx.billCancellationReason.updateMany({
      where: {
        restaurantId,
        code: { in: BILL_CANCELLATION_REASONS.map(({ code }) => code).filter((c) => !kept.has(c)) },
      },
      data: { isActive: false },
    });
    for (const [sortOrder, reason] of edited.entries()) {
      if (reason.code) {
        await tx.billCancellationReason.update({
          where: { restaurantId_code: { restaurantId, code: reason.code } },
          data: { name: reason.name, sortOrder, isActive: true },
        });
      } else {
        await tx.billCancellationReason.create({
          data: { restaurantId, code: `CUSTOM_${randomUUID()}`, name: reason.name, sortOrder },
        });
      }
    }
  }

  private async writeMenu(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    menu: NonNullable<CompletionInput['menu']>,
  ): Promise<
    Pick<CompletionResult['counts'], 'menuCategories' | 'menuItems' | 'menuVariants'> & {
      itemIds: Map<string, string>;
    }
  > {
    const rows = includedMenuRows(menu.rows);
    const categoryIds = new Map<string, string>();
    for (const [sortOrder, category] of summarizeMenuCategories(rows).entries()) {
      const created = await tx.menuCategory.create({
        data: { restaurantId, name: category.name, categoryType: category.type, sortOrder },
        select: { id: true },
      });
      categoryIds.set(category.name.toLowerCase(), created.id);
    }

    // Ids are assigned here so variants and recipes can reference items without a read-back.
    const itemIds = new Map(rows.map((row) => [row.key, randomUUID()]));
    const result = await tx.menuItem.createMany({
      data: rows.map((row) => {
        const categoryId = categoryIds.get(row.category.trim().toLowerCase());
        if (!categoryId) throw new Error(`Menu category ${row.category} was not created`);
        return {
          id: itemIds.get(row.key)!,
          restaurantId,
          categoryId,
          name: row.name.trim(),
          description: row.description.trim() || null,
          price: new Prisma.Decimal(effectiveMenuRowPrice(row).trim()),
          itemType: row.type.trim().toUpperCase() as ServingType,
          isAvailable: row.available,
          dietType: row.dietType ?? null,
          // The guest QR menu's veg flag (egg shows as non-veg).
          isVeg: row.dietType ? row.dietType === 'VEG' : null,
        };
      }),
    });
    const variants = rows.flatMap((row) =>
      (row.variants ?? []).map((variant, sortOrder) => ({
        restaurantId,
        menuItemId: itemIds.get(row.key)!,
        name: variant.name.trim(),
        price: new Prisma.Decimal(variant.price.trim()),
        portionFactor: new Prisma.Decimal(portionFactorForVariant(variant.name)),
        sortOrder,
      })),
    );
    if (variants.length) await tx.menuItemVariant.createMany({ data: variants });
    return {
      menuCategories: categoryIds.size,
      menuItems: result.count,
      menuVariants: variants.length,
      itemIds,
    };
  }

  /**
   * Attaches each dish's recipe. Ingredients the inventory step didn't create are added here (with
   * their estimated cost), so a skipped inventory step never loses a recipe.
   */
  private async writeRecipes(
    tx: Prisma.TransactionClient,
    input: CompletionInput,
    menuItemIds: ReadonlyMap<string, string>,
  ): Promise<{ recipes: number; stockItemsCreated: number }> {
    const recipes = input.recipes!;
    const { restaurantId } = input;
    const key = (name: string): string => name.trim().toLowerCase();

    const existing = await tx.stockItem.findMany({
      where: { restaurantId },
      select: { id: true, name: true, baseUnit: true },
    });
    const stock = new Map(existing.map((item) => [key(item.name), item]));
    const registry = new Map(
      recipes.ingredients.map((ingredient) => [key(ingredient.name), ingredient]),
    );

    let stockItemsCreated = 0;
    let recipeCount = 0;
    const now = new Date();
    for (const dish of recipes.dishes) {
      const menuItemId = menuItemIds.get(dish.menuRowKey);
      if (!menuItemId) continue; // The dish's menu row was left out of the import.

      if (dish.status === 'no-recipe') {
        await tx.menuItem.update({ where: { id: menuItemId }, data: { recipeRequired: false } });
        continue;
      }
      if (!dish.lines.length) continue;

      const lines: Prisma.RecipeItemCreateManyInput[] = [];
      for (const line of dish.lines) {
        const unit = line.unit.trim().toUpperCase() as Unit;
        const base = baseUnitOf(unit) as InventoryBaseUnit;
        let item = stock.get(key(line.ingredient));
        if (!item) {
          const known = registry.get(key(line.ingredient));
          const estimated = known?.estimatedPricePerBase.trim();
          item = await tx.stockItem.create({
            data: {
              restaurantId,
              name: line.ingredient.trim(),
              baseUnit: (known?.baseUnit.trim().toUpperCase() as InventoryBaseUnit) || base,
              estimatedUnitCost:
                estimated && Number(estimated) > 0 ? new Prisma.Decimal(estimated) : null,
            },
            select: { id: true, name: true, baseUnit: true },
          });
          stock.set(key(item.name), item);
          stockItemsCreated += 1;
        }
        if (item.baseUnit && item.baseUnit !== base) {
          throw new BadRequestException(
            `${line.ingredient.trim()} is stocked in ${item.baseUnit.toLowerCase()}, but a recipe uses ${unit.toLowerCase()}. Change the unit in Recipes & costs.`,
          );
        }
        lines.push({
          menuItemId,
          stockItemId: item.id,
          quantity: new Prisma.Decimal(line.quantity.trim()),
          unit,
        });
      }
      await tx.recipeItem.createMany({ data: lines });
      await tx.menuItem.update({
        where: { id: menuItemId },
        data: {
          recipeSource: dish.fromAi ? 'AI_DRAFT' : 'MANUAL',
          recipeReviewedAt: dish.status === 'approved' || !dish.fromAi ? now : null,
        },
      });
      recipeCount += 1;
    }

    await tx.restaurant.update({
      where: { id: restaurantId },
      data: { targetFoodCostMin: recipes.targetMin, targetFoodCostMax: recipes.targetMax },
    });
    return { recipes: recipeCount, stockItemsCreated };
  }

  private async writeInventory(
    tx: Prisma.TransactionClient,
    input: CompletionInput,
  ): Promise<{ created: number; opened: number }> {
    const rows = (input.inventory?.rows ?? []).map((row) => {
      const quantity = row.openingQuantity.trim();
      return {
        item: {
          name: row.name.trim(),
          sku: row.sku.trim(),
          baseUnit: row.baseUnit.trim().toUpperCase() as 'G' | 'ML' | 'UNIT',
          reorderLevel: row.reorderLevel.trim(),
        },
        opening: quantity
          ? {
              quantity,
              unitCost: row.openingUnitCost.trim(),
              reason: OPENING_STOCK_REASON,
            }
          : undefined,
      };
    });
    const result = await this.inventory.createItemsInTransaction(
      tx,
      input.restaurantId,
      input.ownerId,
      rows,
    );
    // Estimated prices keep food cost meaningful until the first real purchase.
    for (const row of input.inventory?.rows ?? []) {
      const estimated = row.estimatedUnitCost?.trim();
      if (!estimated || !(Number(estimated) > 0)) continue;
      await tx.stockItem.updateMany({
        where: { restaurantId: input.restaurantId, name: row.name.trim() },
        data: { estimatedUnitCost: new Prisma.Decimal(estimated) },
      });
    }
    return result;
  }

  private async writeTeam(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    team: readonly TeamAccount[],
  ): Promise<{ id: string; email: string }[]> {
    if (!team.length) return [];
    const roles = await tx.role.findMany({
      where: { restaurantId, name: { in: [...new Set(team.map(({ role }) => role))] } },
      select: { id: true, name: true },
    });
    const roleIds = new Map(roles.map((role) => [role.name, role.id]));

    const users: { id: string; email: string }[] = [];
    for (const member of team) {
      const roleId = roleIds.get(member.role);
      if (!roleId) throw new Error(`Role ${member.role} is not provisioned for this restaurant`);
      users.push(
        await tx.user.create({
          data: {
            restaurantId,
            roleId,
            name: member.name,
            email: member.email,
            // No password: the person sets one from the emailed invitation link.
            passwordHash: null,
            status: 'INVITED',
          },
          select: { id: true, email: true },
        }),
      );
    }
    return users;
  }
}
