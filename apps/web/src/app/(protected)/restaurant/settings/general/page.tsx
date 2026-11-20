import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import RestaurantSettings from '@/containers/RestaurantSettings';

export const metadata: Metadata = {
  title: 'General Settings | Restaurant Management System',
  description: "View and update your restaurant's name, currency, timezone and address.",
};

export default function GeneralSettingsPage(): ReactElement {
  return <RestaurantSettings view="general" embedded />;
}
