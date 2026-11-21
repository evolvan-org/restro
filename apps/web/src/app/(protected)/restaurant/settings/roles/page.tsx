import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import Roles from '@/containers/Roles';

export const metadata: Metadata = {
  title: 'Roles | Restaurant Management System',
  description: 'Create roles and choose what each one can see and do.',
};

export default function RolesSettingsPage(): ReactElement {
  return <Roles />;
}
