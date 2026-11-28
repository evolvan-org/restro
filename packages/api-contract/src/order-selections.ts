import { z } from 'zod';

import { menuModifierSchema, menuVariantSchema } from './menu-customizations';
import { servingTypeSchema } from './serving-types';

export const orderSelectionSnapshotSchema = z
  .object({
    version: z.literal(1),
    basePrice: z.string(),
    unitPrice: z.string(),
    variant: menuVariantSchema.nullable(),
    modifiers: z.array(menuModifierSchema),
    components: z.array(
      z
        .object({
          menuItemId: z.string().uuid(),
          name: z.string(),
          itemType: servingTypeSchema,
          quantity: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict();

export type OrderSelectionSnapshot = z.infer<typeof orderSelectionSnapshotSchema>;
