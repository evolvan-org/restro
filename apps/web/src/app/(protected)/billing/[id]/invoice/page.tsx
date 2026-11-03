import type { ReactElement } from 'react';

import Invoice from '@/containers/Billing/Invoice';

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const { id } = await params;
  return <Invoice id={id} />;
}
