import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import Staff from '@/containers/Staff';

export const metadata: Metadata = {
  title: 'Team | Restaurant Management System',
  description: 'Manage staff accounts, assign roles, and control access.',
};

export default function TeamSettingsPage(): ReactElement {
  return <Staff embedded />;
}
