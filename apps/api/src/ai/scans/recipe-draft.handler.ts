import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type CreateRecipeDraftRequest,
  dishKey,
  type PortionStyle,
  type RecipeDraft,
  type RecipeDraftLine,
  recipeDraftLineSchema,
  recipeDraftSchema,
} from '@rms/api-contract';

import {
  IngredientCatalogService,
  RecipeTemplateRepository,
} from '../catalog/ingredient-catalog.service';
import type { AiJobHandler, JobOutcome, JobRunContext } from '../jobs/ai-job-runner';
import { AiJobsRepository } from '../jobs/ai-jobs.repository';
import { RECIPE_SCHEMA, recipePrompt, recipeSystem } from '../prompts/prompts';
import { AI_PROVIDER, type AiProvider, AiUnavailableError } from '../provider/ai-provider';
import { JsonArrayStream } from '../streaming/json-array-stream';
import { decimalOrNull } from './row-mapping';

const BATCH_SIZE = 10;
/** Drafts below this confidence aren't cached for other restaurants. */
const CACHE_MIN_CONFIDENCE = 60;

type Dish = CreateRecipeDraftRequest['dishes'][number];
export type RecipeJobInput = Pick<CreateRecipeDraftRequest, 'portionStyle' | 'dishes'>;

function cacheKey(dish: Dish): string {
  return `${dishKey(dish.name)}${dish.dietType ? `|${dish.dietType}` : ''}`;
}

function mapLines(raw: unknown): RecipeDraftLine[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((value: unknown) => {
    const line = (value ?? {}) as Record<string, unknown>;
    const quantity = decimalOrNull(line.quantity);
    const parsed = recipeDraftLineSchema.safeParse({
      ingredient: typeof line.ingredient === 'string' ? line.ingredient.trim().slice(0, 150) : '',
      quantity,
      unit: line.unit,
      confidence: Math.max(0, Math.min(100, Math.round(Number(line.confidence) || 50))),
    });
    if (!parsed.success || !(Number(parsed.data.quantity) > 0)) return [];
    const key = parsed.data.ingredient.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [parsed.data];
  });
}

/**
 * Drafts one recipe per dish: from the global template cache when a dish was drafted before
 * (anywhere), otherwise in batches of 10 per model call, streamed dish by dish. Ingredient names are
 * snapped to the catalog so the same ingredient is one stock item and one price.
 */
@Injectable()
export class RecipeDraftHandler implements AiJobHandler {
  readonly kind = 'RECIPE_DRAFT' as const;
  private readonly model: string;

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    private readonly repository: AiJobsRepository,
    private readonly catalog: IngredientCatalogService,
    private readonly templates: RecipeTemplateRepository,
    config: ConfigService,
  ) {
    this.model = config.get<string>('AI_MODEL_RECIPES') ?? 'gemini-2.5-flash-lite';
  }

  async run(context: JobRunContext): Promise<JobOutcome> {
    const input = context.job.input as unknown as RecipeJobInput;
    const done = new Set<string>();
    for (const item of await this.repository.items(context.job.id)) {
      const draft = recipeDraftSchema.safeParse(item.data);
      if (draft.success) done.add(draft.data.dishRef);
    }
    const emit = async (draft: RecipeDraft): Promise<void> => {
      await context.emit({ page: null, confidence: draft.confidence, data: draft });
      done.add(draft.dishRef);
      await context.saveResult(context.job.result, done.size);
    };

    const pending: Dish[] = [];
    for (const dish of input.dishes) {
      if (done.has(dish.ref)) continue;
      if (context.signal.aborted) return { status: 'FAILED', errorCode: 'CANCELLED' };
      const cached = await this.templates.find(cacheKey(dish), input.portionStyle);
      if (cached) {
        await emit({
          dishRef: dish.ref,
          dishName: dish.name,
          lines: cached.lines.slice(0, 30),
          note: cached.note,
          noRecipeNeeded: cached.noRecipeNeeded,
          fromCache: true,
          confidence: 85,
        });
      } else {
        pending.push(dish);
      }
    }

    let unavailable = false;
    const ingredientNames = pending.length ? await this.catalog.canonicalNames() : [];
    for (let index = 0; index < pending.length && !unavailable; index += BATCH_SIZE) {
      if (context.signal.aborted) break;
      const batch = pending.slice(index, index + BATCH_SIZE);
      try {
        await this.draftBatch(context, input.portionStyle, batch, ingredientNames, emit, done);
      } catch (error) {
        if (context.signal.aborted) break;
        if (error instanceof AiUnavailableError) unavailable = true;
      }
      // Dishes the model skipped get an empty draft the owner fills in by hand.
      for (const dish of batch) {
        if (done.has(dish.ref) || unavailable) continue;
        await emit({
          dishRef: dish.ref,
          dishName: dish.name,
          lines: [],
          note: "Couldn't draft this dish. Add its ingredients by hand.",
          noRecipeNeeded: false,
          fromCache: false,
          confidence: 0,
        });
      }
    }

    const drafted = input.dishes.filter((dish) => done.has(dish.ref)).length;
    if (drafted === input.dishes.length) return { status: 'SUCCEEDED', errorCode: null };
    if (drafted > 0) return { status: 'PARTIAL', errorCode: unavailable ? 'AI_UNAVAILABLE' : null };
    return { status: 'FAILED', errorCode: 'AI_UNAVAILABLE' };
  }

  private async draftBatch(
    context: JobRunContext,
    portionStyle: PortionStyle,
    batch: readonly Dish[],
    ingredientNames: readonly string[],
    emit: (draft: RecipeDraft) => Promise<void>,
    done: ReadonlySet<string>,
  ): Promise<void> {
    const byRef = new Map(batch.map((dish) => [dish.ref, dish]));
    const stream = new JsonArrayStream('recipes');
    for await (const chunk of this.provider.stream({
      task: 'recipes',
      model: this.model,
      system: recipeSystem(portionStyle, ingredientNames),
      prompt: recipePrompt(
        batch.map((dish) => ({
          ref: dish.ref,
          name: dish.name,
          category: dish.category,
          diet: dish.dietType,
        })),
      ),
      responseSchema: RECIPE_SCHEMA,
      temperature: 0.2,
      signal: context.signal,
    })) {
      if ('usage' in chunk) {
        await context.recordUsage(chunk.usage);
        continue;
      }
      for (const element of stream.push(chunk.text)) {
        const raw = element as Record<string, unknown>;
        const dish = typeof raw.ref === 'string' ? byRef.get(raw.ref) : undefined;
        if (!dish || done.has(dish.ref)) continue;
        const noRecipeNeeded = raw.noRecipeNeeded === true;
        const lines = noRecipeNeeded
          ? []
          : await this.catalog.canonicalizeLines(mapLines(raw.lines));
        const parsed = recipeDraftSchema.safeParse({
          dishRef: dish.ref,
          dishName: dish.name,
          lines: lines.slice(0, 30),
          note: typeof raw.note === 'string' ? raw.note.trim().slice(0, 500) || null : null,
          noRecipeNeeded,
          fromCache: false,
          confidence: Math.max(0, Math.min(100, Math.round(Number(raw.confidence) || 50))),
        });
        if (!parsed.success) continue;
        await emit(parsed.data);
        if (parsed.data.confidence >= CACHE_MIN_CONFIDENCE && (noRecipeNeeded || lines.length)) {
          await this.templates.save(
            cacheKey(dish),
            portionStyle,
            lines,
            parsed.data.note,
            this.model,
          );
        }
      }
    }
  }
}
