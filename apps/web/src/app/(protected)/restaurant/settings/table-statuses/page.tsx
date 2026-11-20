import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import TableStatuses from '@/containers/TableStatuses';

export const metadata: Metadata = {
  title: 'Table Statuses | Restaurant Management System',
  description: 'Manage statuses used to track table availability.',
};

export default function TableStatusesSettingsPage(): ReactElement {
  return <TableStatuses embedded />;
}
