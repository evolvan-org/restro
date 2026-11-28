import { emptyMenuCustomizations, type MenuCustomizations, type MenuItem } from '@rms/api-contract';

export function getMenuCustomizationDefaults(item: MenuItem): MenuCustomizations {
  return item.customizations ?? emptyMenuCustomizations();
}
