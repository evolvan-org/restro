import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

import SettingsLayoutClient from '../../../../containers/RestaurantSettings/SettingsLayoutClient';

export const metadata: Metadata = {
  title: 'Restaurant Settings | Restaurant Management System',
  description: 'Set up your restaurant once — floor, menu structure, team and billing rules.',
};

export default function RestaurantSettingsLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <SettingsLayoutClient>{children}</SettingsLayoutClient>;
}
