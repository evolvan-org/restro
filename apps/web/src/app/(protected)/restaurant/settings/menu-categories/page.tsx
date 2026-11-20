import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import MenuCategories from '@/containers/MenuCategories';

export const metadata: Metadata = {
  title: 'Menu Categories | Restaurant Management System',
  description: 'Organize menu items into sections and categories.',
};

export default function MenuCategoriesSettingsPage(): ReactElement {
  return <MenuCategories embedded />;
}
