import { z } from 'zod';

/** Shared contract representation of the database ServingType enum. */
export const servingTypeSchema = z.enum(['FOOD', 'BAR'], {
  errorMap: () => ({ message: 'Classification must be FOOD or BAR' }),
});

export const ServingType = servingTypeSchema.enum;
export type ServingType = z.infer<typeof servingTypeSchema>;
