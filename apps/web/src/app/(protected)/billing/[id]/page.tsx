import type { ReactElement } from 'react';

import BillDetails from '@/containers/Billing/Details';

export default async function BillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const { id } = await params;
  return <BillDetails id={id} />;
}
