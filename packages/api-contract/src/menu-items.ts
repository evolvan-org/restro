import { z } from 'zod';

import { servingTypeSchema } from './serving-types';
import { stockItemSchema, unitSchema } from './stock-items';

const menuItemNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(255, 'Name must be 255 characters or fewer');

const descriptionSchema = z.string().trim().max(255, 'Description must be 255 characters or fewer');

const priceSchema = z
  .number({ invalid_type_error: 'Price must be a number' })
  .min(0, 'Price cannot be negative')
  .refine((value) => Number.isFinite(value) && Math.round(value * 100) / 100 === value, {
    message: 'Price can have at most 2 decimal places',
  });

export const MAX_MENU_ITEM_PRICE = '999999.99';

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

export const recipeSchema = z
  .array(recipeRowSchema)
  .min(1, 'A recipe needs at least one ingredient')
  .refine(
    (rows) => new Set(rows.map((row) => row.stockItemId)).size === rows.length,
    'An ingredient can only appear once in a recipe',
  );

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
    recipe: z.array(recipeItemSchema),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const menuItemListQuerySchema = z.object({
  categoryId: z.string().uuid('categoryId must be a UUID').optional(),
  itemType: servingTypeSchema.optional(),
});

export const menuItemListResponseSchema = z.array(menuItemSchema);

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
    recipe: recipeSchema,
  })
  .strict();

/** Partial update; `recipe`, when present, fully replaces the stored recipe. */
export const updateMenuItemRequestSchema = z
  .object({
    categoryId: z.string().uuid().optional(),
    name: menuItemNameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    price: priceSchema.optional(),
    itemType: servingTypeSchema.optional(),
    isAvailable: z.boolean().optional(),
    recipe: recipeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

export type RecipeRow = z.infer<typeof recipeRowSchema>;
export type RecipeItem = z.infer<typeof recipeItemSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type MenuItemListQuery = z.infer<typeof menuItemListQuerySchema>;
export type MenuItemListResponse = z.infer<typeof menuItemListResponseSchema>;
export type CreateMenuItemRequest = z.infer<typeof createMenuItemRequestSchema>;
export type UpdateMenuItemRequest = z.infer<typeof updateMenuItemRequestSchema>;
export type UpdateMenuItemAvailabilityRequest = z.infer<
  typeof updateMenuItemAvailabilityRequestSchema
>;
export type UpdateMenuItemPriceRequest = z.infer<typeof updateMenuItemPriceRequestSchema>;
export type UpdateMenuItemClassificationRequest = z.infer<
  typeof updateMenuItemClassificationRequestSchema
>;
