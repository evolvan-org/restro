import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type IngredientPriceEstimate,
  matchName,
  normalizeName,
  type PortionStyle,
  type RecipeDraftLine,
} from '@rms/api-contract';
import { type InventoryBaseUnit, Prisma } from '@rms/db';
import { z } from 'zod';

import { PrismaService } from '../../common/database/prisma.service';
import { errorDiagnostics } from '../../common/logging/error-diagnostics';
import { PRICE_SCHEMA, PRICE_SYSTEM, pricePrompt } from '../prompts/prompts';
import { AI_PROVIDER, type AiProvider } from '../provider/ai-provider';
import { parseJsonObject } from '../streaming/json-array-stream';

type CatalogEntry = {
  canonicalName: string;
  baseUnit: InventoryBaseUnit;
  aliases: string[];
  pricePerBase: Prisma.Decimal;
  source: 'SEED' | 'AI';
};

const CACHE_TTL_MS = 10 * 60_000;
/** A catalog name or alias must match at least this well to be treated as the same ingredient. */
const CATALOG_MATCH_SCORE = 88;

const modelPricesSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      known: z.boolean(),
      baseUnit: z.enum(['G', 'ML', 'UNIT']),
      price: z.string(),
    }),
  ),
});

/**
 * The global ingredient reference: canonical names, aliases and estimated market prices. Seeded;
 * ingredients it doesn't know are priced once by the model and cached here for everyone.
 */
@Injectable()
export class IngredientCatalogService {
  private readonly logger = new Logger(IngredientCatalogService.name);
  private cache: { at: number; entries: CatalogEntry[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  async entries(): Promise<CatalogEntry[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.entries;
    const rows = await this.prisma.ingredientCatalog.findMany({
      select: {
        canonicalName: true,
        baseUnit: true,
        aliases: true,
        estimatedPricePerBase: true,
        priceSource: true,
      },
      orderBy: { canonicalName: 'asc' },
    });
    const entries = rows.map((row) => ({
      canonicalName: row.canonicalName,
      baseUnit: row.baseUnit,
      aliases: row.aliases,
      pricePerBase: row.estimatedPricePerBase,
      source: row.priceSource,
    }));
    this.cache = { at: Date.now(), entries };
    return entries;
  }

  /** Canonical names the recipe prompt asks the model to reuse. */
  async canonicalNames(): Promise<string[]> {
    return (await this.entries())
      .filter((entry) => entry.source === 'SEED')
      .map((entry) => entry.canonicalName);
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

  /** Estimated price per base unit for each name: catalog first, then the model (cached). */
  async estimate(names: readonly string[]): Promise<{
    items: IngredientPriceEstimate[];
    usage: { inputTokens: number; outputTokens: number };
  }> {
    const unique = [...new Map(names.map((name) => [normalizeName(name), name.trim()])).values()];
    const found = new Map<string, CatalogEntry>();
    const unknown: string[] = [];
    for (const name of unique) {
      const entry = await this.match(name);
      if (entry) found.set(name, entry);
      else unknown.push(name);
    }

    let usage = { inputTokens: 0, outputTokens: 0 };
    if (unknown.length && this.provider.isAvailable()) {
      try {
        const response = await this.provider.generate({
          task: 'ingredient-prices',
          model: this.config.get<string>('AI_MODEL_RECIPES') ?? 'gemini-2.5-flash-lite',
          system: PRICE_SYSTEM,
          prompt: pricePrompt(unknown),
          responseSchema: PRICE_SCHEMA,
        });
        usage = response.usage;
        const parsed = modelPricesSchema.safeParse(parseJsonObject(response.text));
        for (const item of parsed.success ? parsed.data.items : []) {
          const price = Number(item.price);
          const name = unknown.find(
            (candidate) => normalizeName(candidate) === normalizeName(item.name),
          );
          if (!name || !item.known || !(price > 0) || price > 500_000) continue;
          const perBase = item.baseUnit === 'UNIT' ? price : price / 1000;
          const entry = await this.remember(name, item.baseUnit, perBase);
          if (entry) found.set(name, entry);
        }
      } catch (error) {
        this.logger.warn('Ingredient price estimate failed', errorDiagnostics(error));
      }
    }

    const items = unique.map((name): IngredientPriceEstimate => {
      const entry = found.get(name);
      if (!entry) {
        return {
          name,
          canonicalName: null,
          baseUnit: 'G',
          pricePerBase: null,
          source: 'none',
          aliases: [],
        };
      }
      return {
        name,
        canonicalName: entry.canonicalName,
        baseUnit: entry.baseUnit,
        pricePerBase: entry.pricePerBase.toFixed(8).replace(/\.?0+$/, ''),
        source: entry.source === 'SEED' ? 'catalog' : 'ai',
        aliases: entry.aliases,
      };
    });
    return { items, usage };
  }

  private async remember(
    name: string,
    baseUnit: InventoryBaseUnit,
    pricePerBase: number,
  ): Promise<CatalogEntry | null> {
    const canonicalName = name.trim().slice(0, 150);
    try {
      const row = await this.prisma.ingredientCatalog.upsert({
        where: { canonicalName },
        create: {
          canonicalName,
          baseUnit,
          estimatedPricePerBase: new Prisma.Decimal(pricePerBase.toFixed(8)),
          priceSource: 'AI',
        },
        update: {},
      });
      this.cache = null;
      return {
        canonicalName: row.canonicalName,
        baseUnit: row.baseUnit,
        aliases: row.aliases,
        pricePerBase: row.estimatedPricePerBase,
        source: row.priceSource,
      };
    } catch (error) {
      this.logger.warn('Could not cache an ingredient price', errorDiagnostics(error));
      return null;
    }
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
