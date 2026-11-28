import {
  type AddOrderItemRequest,
  addOrderItemRequestSchema,
  emptyMenuCustomizations,
  type MenuItem,
} from '@rms/api-contract';
import { z } from 'zod';

export function getAddOrderItemDefaults(item: MenuItem): AddOrderItemRequest {
  return { menuItemId: item.id, quantity: 1, specialInstructions: '', modifierIds: [] };
}

export function getAddOrderItemFormSchema(
  item: MenuItem,
): z.ZodEffects<typeof addOrderItemRequestSchema> {
  const config = item.customizations ?? emptyMenuCustomizations();
  return addOrderItemRequestSchema.superRefine((input, context) => {
    const selected = new Set(input.modifierIds ?? []);
    for (const group of config.groups) {
      const count = group.modifiers.filter((option) => selected.has(option.id)).length;
      if (count < group.minSelect || count > group.maxSelect) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['modifierIds'],
          message: `Choose ${group.minSelect} to ${group.maxSelect} options for ${group.name}`,
        });
      }
    }
  });
}

function cents(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = value.replace(/^-/, '').split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -amount : amount;
}

function money(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function getOrderSelectionPricePreview(
  item: MenuItem,
  variantId: string | undefined,
  modifierIds: readonly string[] | undefined,
  quantity: number,
): { unitPrice: string; total: string } | null {
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  const config = item.customizations ?? emptyMenuCustomizations();
  const variant = config.variants.find((candidate) => candidate.id === variantId);
  const selected = new Set(modifierIds ?? []);
  const unit = config.groups
    .flatMap((group) => group.modifiers)
    .filter((option) => selected.has(option.id))
    .reduce(
      (sum, option) => sum + cents(option.priceAdjustment),
      cents(variant?.price ?? item.price),
    );
  return { unitPrice: money(unit), total: money(unit * BigInt(quantity)) };
}
