import { z } from 'zod';

const labelSchema = z.string().trim().min(1).max(100);
const priceSchema = z
  .string()
  .trim()
  .regex(/^\d{1,6}(?:\.\d{1,2})?$/, 'Use a price up to 999999.99');
const adjustmentSchema = z
  .string()
  .trim()
  .regex(/^-?\d{1,6}(?:\.\d{1,2})?$/, 'Use an adjustment between -999999.99 and 999999.99');

export const menuVariantSchema = z
  .object({ id: z.string().uuid(), name: labelSchema, price: priceSchema })
  .strict();

export const menuModifierSchema = z
  .object({
    id: z.string().uuid(),
    name: labelSchema,
    priceAdjustment: adjustmentSchema,
    kitchenNote: z.string().trim().max(255).optional(),
  })
  .strict();

export const menuModifierGroupSchema = z
  .object({
    id: z.string().uuid(),
    name: labelSchema,
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(1).max(20),
    modifiers: z.array(menuModifierSchema).min(1).max(20),
  })
  .strict()
  .superRefine((group, context) => {
    if (group.minSelect > group.maxSelect || group.maxSelect > group.modifiers.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxSelect'],
        message: 'Selection limits must fit the available choices',
      });
    }
  });

export const menuComboComponentSchema = z
  .object({ menuItemId: z.string().uuid(), quantity: z.number().int().min(1).max(100) })
  .strict();

export const menuCustomizationsSchema = z
  .object({
    variants: z.array(menuVariantSchema).max(20),
    groups: z.array(menuModifierGroupSchema).max(20),
    components: z.array(menuComboComponentSchema).max(50),
  })
  .strict()
  .superRefine((config, context) => {
    const ids = [
      ...config.variants.map((variant) => variant.id),
      ...config.groups.flatMap((group) => [
        group.id,
        ...group.modifiers.map((option) => option.id),
      ]),
    ];
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choice identifiers must be unique',
      });
    }
    if (
      new Set(config.components.map((item) => item.menuItemId)).size !== config.components.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['components'],
        message: 'A combo component may only appear once',
      });
    }
  });

export type MenuVariant = z.infer<typeof menuVariantSchema>;
export type MenuModifier = z.infer<typeof menuModifierSchema>;
export type MenuModifierGroup = z.infer<typeof menuModifierGroupSchema>;
export type MenuComboComponent = z.infer<typeof menuComboComponentSchema>;
export type MenuCustomizations = z.infer<typeof menuCustomizationsSchema>;

export function emptyMenuCustomizations(): MenuCustomizations {
  return { variants: [], groups: [], components: [] };
}
