import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import Tables from '@/containers/Tables';

export const metadata: Metadata = {
  title: 'Tables | Restaurant Management System',
  description: 'Configure tables, capacity, and section placement.',
};

export default function TablesSettingsPage(): ReactElement {
  return <Tables embedded />;
}
