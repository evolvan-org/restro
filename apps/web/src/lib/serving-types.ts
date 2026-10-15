import { ServingType, servingTypeSchema } from '@rms/api-contract';

const SERVING_TYPE_LABELS: Record<ServingType, string> = {
  [ServingType.FOOD]: 'Food',
  [ServingType.BAR]: 'Bar',
};

export function getServingTypeLabel(itemType: ServingType): string {
  return SERVING_TYPE_LABELS[itemType];
}

export function getServingTypeOptions(): { value: ServingType; label: string }[] {
  return servingTypeSchema.options.map((value) => ({ value, label: getServingTypeLabel(value) }));
}
