import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import RestaurantSettings from '@/containers/RestaurantSettings';

export const metadata: Metadata = {
  title: 'Tax & Discounts | Restaurant Management System',
  description: 'Manage GST information, default tax rates, and discount caps.',
};

export default function TaxDiscountsSettingsPage(): ReactElement {
  return <RestaurantSettings view="tax" embedded />;
}
