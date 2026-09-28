import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './common';

const sectionNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(150, 'Name must be 150 characters or fewer');

const sectionDescriptionSchema = z
  .string()
  .trim()
  .max(255, 'Description must be 255 characters or fewer')
  .optional();

const sortOrderSchema = z
  .number({ invalid_type_error: 'Display order must be a number' })
  .int('Display order must be a whole number')
  .min(0, 'Display order cannot be negative');

export const diningSectionSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const diningSectionListQuerySchema = paginationQuerySchema;
export const diningSectionListResponseSchema = paginatedResponseSchema(diningSectionSchema);

export const createDiningSectionRequestSchema = z
  .object({
    name: sectionNameSchema,
    description: sectionDescriptionSchema,
    sortOrder: sortOrderSchema.optional().describe('Omit to place the section at the end'),
  })
  .strict();

export const updateDiningSectionRequestSchema = z
  .object({
    name: sectionNameSchema,
    description: sectionDescriptionSchema,
    sortOrder: sortOrderSchema,
  })
  .strict();

export const updateDiningSectionStatusRequestSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const reorderDiningSectionsRequestSchema = z
  .object({
    orderedIds: z
      .array(z.string().uuid())
      .min(1, 'At least one section is required')
      .refine((ids) => new Set(ids).size === ids.length, 'Section ids must be unique')
      .describe('Every section id in the restaurant, in the desired display order'),
  })
  .strict();

export const reorderDiningSectionsResponseSchema = z.array(diningSectionSchema);

export type DiningSection = z.infer<typeof diningSectionSchema>;
export type DiningSectionListQuery = z.infer<typeof diningSectionListQuerySchema>;
export type DiningSectionListResponse = z.infer<typeof diningSectionListResponseSchema>;
export type CreateDiningSectionRequest = z.infer<typeof createDiningSectionRequestSchema>;
export type UpdateDiningSectionRequest = z.infer<typeof updateDiningSectionRequestSchema>;
export type UpdateDiningSectionStatusRequest = z.infer<
  typeof updateDiningSectionStatusRequestSchema
>;
export type ReorderDiningSectionsRequest = z.infer<typeof reorderDiningSectionsRequestSchema>;
export type ReorderDiningSectionsResponse = z.infer<typeof reorderDiningSectionsResponseSchema>;
