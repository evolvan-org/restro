import type { Metadata } from 'next';

import RestaurantSettings from '@/containers/RestaurantSettings';

export const metadata: Metadata = {
  title: 'Restaurant Settings | Restaurant Management System',
  description: "View and update your restaurant's name, currency, timezone and tax settings.",
};

export default RestaurantSettings;
