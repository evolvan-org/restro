import {
  type MenuItem,
  type ServingType,
  type UpdateMenuItemClassificationRequest,
  updateMenuItemClassificationRequestSchema,
} from '@rms/api-contract';
import type { z } from 'zod';

import { getServingTypeLabel } from '@/lib/serving-types';

export function getClassificationFormDefaults(
  item: Pick<MenuItem, 'itemType'>,
): UpdateMenuItemClassificationRequest {
  return { itemType: item.itemType };
}

export function getClassificationFormSchema(
  categoryType: ServingType | undefined,
): z.ZodType<UpdateMenuItemClassificationRequest> {
  return updateMenuItemClassificationRequestSchema.refine(
    (input) => categoryType !== undefined && input.itemType === categoryType,
    { path: ['itemType'], message: 'Item classification must match its category classification' },
  );
}

export function getClassificationFormLabels(
  name: string,
  categoryType: ServingType | undefined,
): { select: string; save: string; hint: string } {
  return {
    select: `Classification for ${name}`,
    save: `Save classification for ${name}`,
    hint: categoryType
      ? `Must match the category: ${getServingTypeLabel(categoryType)}.`
      : 'Category classification is unavailable.',
  };
}
