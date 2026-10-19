import { z } from 'zod';

import { servingTypeSchema } from './serving-types';

const categoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(150, 'Name must be 150 characters or fewer');

const sortOrderSchema = z
  .number({ invalid_type_error: 'Display order must be a number' })
  .int('Display order must be a whole number')
  .min(0, 'Display order cannot be negative');

/** Mirrors the Prisma `ServingType` enum. */
export const categoryTypeSchema = z.enum(servingTypeSchema.options, {
  errorMap: () => ({ message: 'Category type must be FOOD or BAR' }),
});

export const menuCategorySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    categoryType: categoryTypeSchema,
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

/** `?activeOnly=true` hides deactivated categories; anything but `true`/`false` is a 400. */
export const menuCategoryListQuerySchema = z.object({
  activeOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export const menuCategoryListResponseSchema = z.array(menuCategorySchema);

export const createMenuCategoryRequestSchema = z
  .object({
    name: categoryNameSchema,
    categoryType: categoryTypeSchema,
    sortOrder: sortOrderSchema.optional().describe('Omit to place the category at the end'),
  })
  .strict();

export const updateMenuCategoryRequestSchema = z
  .object({
    name: categoryNameSchema.optional(),
    categoryType: categoryTypeSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });

export const reorderMenuCategoriesRequestSchema = z
  .object({
    orderedIds: z
      .array(z.string().uuid())
      .min(1, 'At least one category is required')
      .refine((ids) => new Set(ids).size === ids.length, 'Category ids must be unique')
      .describe('Every category id in the restaurant, in the desired display order'),
  })
  .strict();

export const reorderMenuCategoriesResponseSchema = menuCategoryListResponseSchema;

export type CategoryType = z.infer<typeof categoryTypeSchema>;
export type MenuCategory = z.infer<typeof menuCategorySchema>;
export type MenuCategoryListQuery = z.infer<typeof menuCategoryListQuerySchema>;
export type MenuCategoryListResponse = z.infer<typeof menuCategoryListResponseSchema>;
export type CreateMenuCategoryRequest = z.infer<typeof createMenuCategoryRequestSchema>;
export type UpdateMenuCategoryRequest = z.infer<typeof updateMenuCategoryRequestSchema>;
export type ReorderMenuCategoriesRequest = z.infer<typeof reorderMenuCategoriesRequestSchema>;
export type ReorderMenuCategoriesResponse = z.infer<typeof reorderMenuCategoriesResponseSchema>;
