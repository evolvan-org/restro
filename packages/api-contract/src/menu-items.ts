import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './common';
import { servingTypeSchema } from './serving-types';
import { stockItemSchema, unitSchema } from './stock-items';

const menuItemNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(255, 'Name must be 255 characters or fewer');

const descriptionSchema = z.string().trim().max(255, 'Description must be 255 characters or fewer');

export const MAX_MENU_ITEM_PRICE = '999999.99';

const priceSchema = z
  .number({ invalid_type_error: 'Price must be a number' })
  .min(0, 'Price cannot be negative')
  .max(Number(MAX_MENU_ITEM_PRICE), `Price cannot exceed ${MAX_MENU_ITEM_PRICE}`)
  .refine((value) => Number.isFinite(value) && Math.round(value * 100) / 100 === value, {
    message: 'Price can have at most 2 decimal places',
  });

const decimalPricePattern = /^\d{1,10}(?:\.\d{1,2})?$/;

function priceInMinorUnits(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/** The focused price-edit path keeps money as a decimal string throughout. */
export const menuItemPriceSchema = z
  .string({
    required_error: 'Price is required',
    invalid_type_error: 'Price must be a decimal string',
  })
  .trim()
  .min(1, 'Price is required')
  .regex(decimalPricePattern, 'Price must be non-negative with at most 2 decimal places')
  .refine(
    (value) =>
      !decimalPricePattern.test(value) ||
      priceInMinorUnits(value) <= priceInMinorUnits(MAX_MENU_ITEM_PRICE),
    { message: `Price cannot exceed ${MAX_MENU_ITEM_PRICE}` },
  )
  .describe(
    `Non-negative decimal string with at most 2 decimal places; maximum ${MAX_MENU_ITEM_PRICE}`,
  );

/**
 * Recipe quantities are decimal strings end to end (never JS floats): the column is
 * Decimal(12,3), so at most 9 integer digits and 3 fraction digits, and strictly positive.
 */
export const recipeQuantitySchema = z
  .string({ invalid_type_error: 'Quantity must be a decimal string' })
  .trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Quantity must be a number with up to 3 decimal places')
  .refine((value) => Number(value) > 0, 'Quantity must be greater than 0');

export const recipeRowSchema = z
  .object({
    stockItemId: z.string({ required_error: 'Ingredient is required' }).uuid('Pick an ingredient'),
    quantity: recipeQuantitySchema,
    unit: unitSchema,
  })
  .strict();

/** May be empty only for an item marked "No recipe needed" (`recipeRequired: false`). */
export const recipeSchema = z
  .array(recipeRowSchema)
  .refine(
    (rows) => new Set(rows.map((row) => row.stockItemId)).size === rows.length,
    'An ingredient can only appear once in a recipe',
  );

/** Veg / non-veg / egg marker (drawn as circle / triangle / ring, never colour alone). */
export const DIET_TYPES = ['VEG', 'NON_VEG', 'EGG'] as const;
export const dietTypeSchema = z.enum(DIET_TYPES, {
  errorMap: () => ({ message: 'Choose veg, non-veg or egg' }),
});
export const DIET_TYPE_LABELS: Record<DietType, string> = {
  VEG: 'Veg',
  NON_VEG: 'Non-veg',
  EGG: 'Egg',
};

export const recipeSourceSchema = z.enum(['MANUAL', 'AI_DRAFT']);

export const MENU_ITEM_MAX_VARIANTS = 6;
export const portionFactorSchema = z
  .string()
  .trim()
  .regex(/^\d{1,2}(?:\.\d{1,3})?$/, 'Portion factor must be a number with up to 3 decimals')
  .refine((value) => Number(value) > 0, 'Portion factor must be greater than 0');

export const menuItemVariantInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z
      .string()
      .trim()
      .min(1, 'Portion name is required')
      .max(50, 'Portion name must be 50 characters or fewer'),
    price: menuItemPriceSchema,
    portionFactor: portionFactorSchema.optional(),
  })
  .strict();

export const menuItemVariantsInputSchema = z
  .array(menuItemVariantInputSchema)
  .max(MENU_ITEM_MAX_VARIANTS, `At most ${MENU_ITEM_MAX_VARIANTS} portions`)
  .refine(
    (rows) => new Set(rows.map((row) => row.name.toLowerCase())).size === rows.length,
    'Two portions have the same name',
  )
  .refine((rows) => rows.length !== 1, 'Add at least two portions, or none');

export const menuItemVariantSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    price: z.string(),
    portionFactor: z.string(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
  })
  .strict();

export const recipeItemSchema = z
  .object({
    stockItem: stockItemSchema,
    quantity: z.string(),
    unit: unitSchema,
  })
  .strict();

export const menuItemSchema = z
  .object({
    id: z.string().uuid(),
    categoryId: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    price: z.string().describe('Decimal string with 2 fraction digits'),
    itemType: servingTypeSchema,
    isAvailable: z.boolean(),
    isActive: z.boolean(),
    /** False marks "No recipe needed": the item is never listed as missing a recipe. */
    recipeRequired: z.boolean(),
    recipe: z.array(recipeItemSchema),
    dietType: dietTypeSchema.nullable(),
    variants: z.array(menuItemVariantSchema),
    recipeSource: recipeSourceSchema,
    /** Null for an AI-drafted recipe nobody has reviewed yet. */
    recipeReviewedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

/** `?activeOnly=true` hides deactivated items; anything but `true`/`false` is a 400. */
const activeOnlySchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const menuItemListQuerySchema = z.object({
  categoryId: z.string().uuid('categoryId must be a UUID').optional(),
  itemType: servingTypeSchema.optional(),
  activeOnly: activeOnlySchema,
});

export const menuItemListResponseSchema = z.array(menuItemSchema);

export const menuItemSearchQuerySchema = paginationQuerySchema.extend({
  recipeStatus: z
    .enum(['ai-unreviewed'])
    .optional()
    .describe('`ai-unreviewed`: AI-drafted recipes nobody has reviewed yet'),
  q: z
    .string()
    .trim()
    .max(100, 'Search must be 100 characters or fewer')
    .optional()
    .describe('Case-insensitive match on name or description'),
  categoryId: z.string().uuid('categoryId must be a UUID').optional(),
  itemType: servingTypeSchema.optional(),
  isAvailable: z
    .enum(['true', 'false'], { invalid_type_error: 'isAvailable must be true or false' })
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  activeOnly: activeOnlySchema,
});

export const menuItemSearchResponseSchema = paginatedResponseSchema(menuItemSchema);

export const updateMenuItemAvailabilityRequestSchema = z
  .object({
    isAvailable: z.boolean(),
  })
  .strict();

export const updateMenuItemPriceRequestSchema = z
  .object({
    price: menuItemPriceSchema,
  })
  .strict();

export const updateMenuItemClassificationRequestSchema = z
  .object({
    itemType: servingTypeSchema,
  })
  .strict();

export const createMenuItemRequestSchema = z
  .object({
    categoryId: z.string().uuid('Category is required'),
    name: menuItemNameSchema,
    description: descriptionSchema.optional(),
    price: priceSchema,
    itemType: servingTypeSchema,
    isAvailable: z.boolean().optional().default(true),
    recipeRequired: z.boolean().optional().default(true),
    recipe: recipeSchema,
    dietType: dietTypeSchema.nullable().optional(),
    variants: menuItemVariantsInputSchema.optional(),
  })
  .strict()
  .refine((value) => !value.recipeRequired || value.recipe.length > 0, {
    message: 'A recipe needs at least one ingredient',
    path: ['recipe'],
  })
  .describe('`recipe` may be empty only when `recipeRequired` is false');

/** Partial update; `recipe`, when present, fully replaces the stored recipe. */
export const updateMenuItemRequestSchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    name: menuItemNameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    price: priceSchema.optional(),
    itemType: servingTypeSchema.optional(),
    isAvailable: z.boolean().optional(),
    isActive: z.boolean().optional(),
    recipeRequired: z.boolean().optional(),
    recipe: recipeSchema.optional(),
    dietType: dietTypeSchema.nullable().optional(),
    /** Replaces the item's portions; an empty list removes them. */
    variants: menuItemVariantsInputSchema.optional(),
    /** Marks an AI-drafted recipe as reviewed without changing it. */
    recipeReviewed: z.literal(true).optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  })
  .refine((value) => value.recipe?.length !== 0 || value.recipeRequired === false, {
    message: 'A recipe needs at least one ingredient',
    path: ['recipe'],
  })
  .describe('An empty `recipe` is accepted only together with `recipeRequired: false`');

export type RecipeRow = z.infer<typeof recipeRowSchema>;
export type RecipeItem = z.infer<typeof recipeItemSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type MenuItemListQuery = z.infer<typeof menuItemListQuerySchema>;
export type MenuItemListResponse = z.infer<typeof menuItemListResponseSchema>;
export type MenuItemSearchQuery = z.infer<typeof menuItemSearchQuerySchema>;
export type MenuItemSearchResponse = z.infer<typeof menuItemSearchResponseSchema>;
export type CreateMenuItemRequest = z.infer<typeof createMenuItemRequestSchema>;
export type UpdateMenuItemRequest = z.infer<typeof updateMenuItemRequestSchema>;
export type UpdateMenuItemAvailabilityRequest = z.infer<
  typeof updateMenuItemAvailabilityRequestSchema
>;
export type UpdateMenuItemPriceRequest = z.infer<typeof updateMenuItemPriceRequestSchema>;
export type UpdateMenuItemClassificationRequest = z.infer<
  typeof updateMenuItemClassificationRequestSchema
>;

/** Post-onboarding "Import from photo": reviewed rows become live items in one transaction. */
export const MENU_BULK_IMPORT_MAX_ROWS = 300;
export const bulkImportMenuItemRowSchema = z
  .object({
    category: z.string().trim().min(1, 'Category is required').max(150),
    itemType: servingTypeSchema,
    name: menuItemNameSchema,
    description: descriptionSchema.optional(),
    price: menuItemPriceSchema,
    dietType: dietTypeSchema.nullable().optional(),
    variants: menuItemVariantsInputSchema.optional(),
  })
  .strict();
export const bulkImportMenuItemsRequestSchema = z
  .object({
    scanJobId: z.string().uuid().optional(),
    rows: z.array(bulkImportMenuItemRowSchema).min(1).max(MENU_BULK_IMPORT_MAX_ROWS),
  })
  .strict();
export const bulkImportMenuItemsResponseSchema = z
  .object({
    created: z.number().int().nonnegative(),
    categoriesCreated: z.number().int().nonnegative(),
    /** Rows left out because the live menu already has an item with that name in that category. */
    skippedDuplicates: z.array(z.object({ name: z.string(), category: z.string() }).strict()),
  })
  .strict();

export type DietType = z.infer<typeof dietTypeSchema>;
export type RecipeSource = z.infer<typeof recipeSourceSchema>;
export type MenuItemVariant = z.infer<typeof menuItemVariantSchema>;
export type MenuItemVariantInput = z.infer<typeof menuItemVariantInputSchema>;
export type BulkImportMenuItemRow = z.infer<typeof bulkImportMenuItemRowSchema>;
export type BulkImportMenuItemsRequest = z.infer<typeof bulkImportMenuItemsRequestSchema>;
export type BulkImportMenuItemsResponse = z.infer<typeof bulkImportMenuItemsResponseSchema>;
