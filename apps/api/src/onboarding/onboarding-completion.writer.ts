import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable } from '@nestjs/common';
import {
  API_ERROR_CODES,
  type CompleteOnboardingData,
  type CompleteOnboardingDetails,
  type OnboardingStage,
  summarizeMenuCategories,
  tableStatusCodeFromName,
} from '@rms/api-contract';
import {
  BILL_CANCELLATION_REASONS,
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
            teamMembers: 0,
          };

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
            Object.assign(counts, await this.writeMenu(tx, input.restaurantId, input.menu));
          }

          if (input.inventory?.rows.length) {
            stage = 'inventory';
            const result = await this.writeInventory(tx, input);
            counts.stockItems = result.created;
            counts.openingStock = result.opened;
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
  ): Promise<Pick<CompletionResult['counts'], 'menuCategories' | 'menuItems'>> {
    const categoryIds = new Map<string, string>();
    for (const [sortOrder, category] of summarizeMenuCategories(menu.rows).entries()) {
      const created = await tx.menuCategory.create({
        data: { restaurantId, name: category.name, categoryType: category.type, sortOrder },
        select: { id: true },
      });
      categoryIds.set(category.name.toLowerCase(), created.id);
    }

    const result = await tx.menuItem.createMany({
      data: menu.rows.map((row) => {
        const categoryId = categoryIds.get(row.category.trim().toLowerCase());
        if (!categoryId) throw new Error(`Menu category ${row.category} was not created`);
        return {
          restaurantId,
          categoryId,
          name: row.name.trim(),
          description: row.description.trim() || null,
          price: new Prisma.Decimal(row.price.trim()),
          itemType: row.type.trim().toUpperCase() as ServingType,
          isAvailable: row.available,
        };
      }),
    });
    return { menuCategories: categoryIds.size, menuItems: result.count };
  }

  private writeInventory(
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
    return this.inventory.createItemsInTransaction(tx, input.restaurantId, input.ownerId, rows);
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
