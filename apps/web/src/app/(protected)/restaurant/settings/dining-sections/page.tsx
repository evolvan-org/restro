import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import DiningSections from '@/containers/DiningSections';

export const metadata: Metadata = {
  title: 'Dining Sections | Restaurant Management System',
  description: 'Create and organize dining areas for your tables.',
};

export default function DiningSectionsSettingsPage(): ReactElement {
  return <DiningSections embedded />;
}
