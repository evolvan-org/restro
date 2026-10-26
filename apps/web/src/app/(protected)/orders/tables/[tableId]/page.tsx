import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import TableOrder from '@/containers/TableOrder';

export const metadata: Metadata = {
  title: 'Table order | Restaurant Management System',
  description: 'Open or resume a table order and browse the ordering menu.',
};

export default async function TableOrderPage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}): Promise<ReactElement> {
  const { tableId } = await params;
  return <TableOrder tableId={tableId} />;
}
