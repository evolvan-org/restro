import { Injectable } from '@nestjs/common';
import { matchName, type PortionStyle, type RecipeDraftLine } from '@rms/api-contract';
import { type InventoryBaseUnit, Prisma } from '@rms/db';

import { PrismaService } from '../../common/database/prisma.service';

type CatalogEntry = {
  canonicalName: string;
  baseUnit: InventoryBaseUnit;
  aliases: string[];
};

const CACHE_TTL_MS = 10 * 60_000;
/** A catalog name or alias must match at least this well to be treated as the same ingredient. */
const CATALOG_MATCH_SCORE = 88;

/**
 * The global ingredient reference (seeded, no tenant data): canonical names, aliases and the unit
 * each is stocked in. It keeps drafted recipes consistent ("Dahi" and "Curd" become one name). It
 * holds no prices: food cost comes only from a restaurant's real purchases.
 */
@Injectable()
export class IngredientCatalogService {
  private cache: { at: number; entries: CatalogEntry[] } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async entries(): Promise<CatalogEntry[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.entries;
    const entries = await this.prisma.ingredientCatalog.findMany({
      select: { canonicalName: true, baseUnit: true, aliases: true },
      orderBy: { canonicalName: 'asc' },
    });
    this.cache = { at: Date.now(), entries };
    return entries;
  }

  /** Canonical names the recipe prompt asks the model to reuse. */
  async canonicalNames(): Promise<string[]> {
    return (await this.entries()).map((entry) => entry.canonicalName);
  }

  async match(name: string): Promise<CatalogEntry | null> {
    const entries = await this.entries();
    const [best] = matchName(
      name,
      entries.map((entry) => ({
        key: entry.canonicalName,
        name: entry.canonicalName,
        aliases: entry.aliases,
      })),
      { limit: 1, minScore: CATALOG_MATCH_SCORE },
    );
    return best ? (entries.find((entry) => entry.canonicalName === best.key) ?? null) : null;
  }

  /** Rewrites recipe lines to canonical ingredient names where one clearly matches. */
  async canonicalizeLines(lines: readonly RecipeDraftLine[]): Promise<RecipeDraftLine[]> {
    return Promise.all(
      lines.map(async (line) => {
        const entry = await this.match(line.ingredient);
        return entry ? { ...line, ingredient: entry.canonicalName } : line;
      }),
    );
  }
}

/** Global cache of drafted recipes, keyed by normalised dish name and portion style. */
@Injectable()
export class RecipeTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(
    dishKey: string,
    portionStyle: PortionStyle,
  ): Promise<{ lines: RecipeDraftLine[]; note: string | null; noRecipeNeeded: boolean } | null> {
    const row = await this.prisma.recipeTemplate.findUnique({
      where: { dishKey_portionStyle: { dishKey, portionStyle } },
      select: { id: true, lines: true, note: true },
    });
    if (!row) return null;
    await this.prisma.recipeTemplate.update({
      where: { id: row.id },
      data: { hits: { increment: 1 } },
    });
    const lines = (row.lines ?? []) as RecipeDraftLine[];
    return { lines, note: row.note, noRecipeNeeded: lines.length === 0 };
  }

  async save(
    dishKey: string,
    portionStyle: PortionStyle,
    lines: readonly RecipeDraftLine[],
    note: string | null,
    model: string,
  ): Promise<void> {
    await this.prisma.recipeTemplate.upsert({
      where: { dishKey_portionStyle: { dishKey, portionStyle } },
      create: {
        dishKey: dishKey.slice(0, 200),
        portionStyle,
        lines: lines as unknown as Prisma.InputJsonValue,
        note: note?.slice(0, 500) ?? null,
        model: model.slice(0, 80),
      },
      update: {},
    });
  }
}
