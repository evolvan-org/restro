import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import RoleEditor from '@/containers/RoleEditor';

export const metadata: Metadata = {
  title: 'Role | Restaurant Management System',
};

export default async function RolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const { id } = await params;
  return <RoleEditor roleId={id} />;
}
