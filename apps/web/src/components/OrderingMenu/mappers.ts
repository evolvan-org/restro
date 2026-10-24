import type { MenuCategory, MenuItem } from '@rms/api-contract';

export type OrderingMenuFilters = { search: string; categoryId: string; page: number };

export function getOrderingMenuDefaults(): OrderingMenuFilters {
  return { search: '', categoryId: '', page: 1 };
}

export function getOrderingCategories(categories: readonly MenuCategory[]): MenuCategory[] {
  return categories
    .filter((category) => category.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function groupOrderingItems(
  categories: readonly MenuCategory[],
  items: readonly MenuItem[],
  selectedCategoryId: string,
): { category: MenuCategory; items: MenuItem[] }[] {
  return categories
    .filter((category) => !selectedCategoryId || category.id === selectedCategoryId)
    .map((category) => ({
      category,
      items: items.filter((item) => item.isActive && item.categoryId === category.id),
    }));
}
