import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import RoleEditor from '@/containers/RoleEditor';

export const metadata: Metadata = {
  title: 'New role | Restaurant Management System',
};

export default async function NewRolePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}): Promise<ReactElement> {
  const { from } = await searchParams;
  return <RoleEditor duplicateFromId={from} />;
}
