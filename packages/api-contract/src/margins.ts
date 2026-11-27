import { z } from 'zod';

/*
 * Margin report: plate cost and food-cost % per dish (and per portion) from live recipes, using
 * real ingredient costs only (latest purchase, else running average). A dish is costed only when
 * every ingredient has a real cost; there are no estimated prices.
 */

export const costBandSchema = z.enum(['healthy', 'watch', 'poor']);

export const marginRowSchema = z
  .object({
    menuItemId: z.string().uuid(),
    variantId: z.string().uuid().nullable(),
    name: z.string(),
    category: z.string(),
    sellingPrice: z.number(),
    /** Null until every ingredient in the recipe has a real cost. */
    plateCost: z.number().nullable(),
    foodCostPercent: z.number().nullable(),
    marginPercent: z.number().nullable(),
    band: costBandSchema.nullable(),
    /** Ingredients with no real cost yet (no purchase or opening stock cost). */
    missingPrices: z.number().int().nonnegative(),
    recipeUnreviewed: z.boolean(),
  })
  .strict();

export const marginReportSchema = z
  .object({
    target: z.object({ min: z.number(), max: z.number() }).strict(),
    averageFoodCostPercent: z.number().nullable(),
    rows: z.array(marginRowSchema),
    /** Active items that need a recipe but have none. */
    missingRecipes: z.number().int().nonnegative(),
  })
  .strict();

/** "What if" costs (e.g. from an invoice before saving) → before / after per dish. */
export const marginPreviewRequestSchema = z
  .object({
    costs: z
      .array(
        z
          .object({
            stockItemId: z.string().uuid(),
            unitCost: z.string().regex(/^\d{1,10}(?:\.\d{1,8})?$/),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

export const marginPreviewResponseSchema = z
  .object({
    changes: z.array(
      z
        .object({
          menuItemId: z.string().uuid(),
          variantId: z.string().uuid().nullable(),
          name: z.string(),
          before: z.number(),
          after: z.number(),
          delta: z.number(),
        })
        .strict(),
    ),
    ingredientsUpdated: z.number().int().nonnegative(),
    dishesAffected: z.number().int().nonnegative(),
  })
  .strict();

export type CostBandValue = z.infer<typeof costBandSchema>;
export type MarginRow = z.infer<typeof marginRowSchema>;
export type MarginReport = z.infer<typeof marginReportSchema>;
export type MarginPreviewRequest = z.infer<typeof marginPreviewRequestSchema>;
export type MarginPreviewResponse = z.infer<typeof marginPreviewResponseSchema>;
