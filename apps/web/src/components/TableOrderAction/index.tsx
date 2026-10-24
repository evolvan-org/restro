'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';

import { buttonVariants } from '@/components/ui/button';

type Props = { tableId: string; tableNumber: string; canStart: boolean };

export default function TableOrderAction({ tableId, tableNumber, canStart }: Props): ReactElement {
  return (
    <Link
      href={`/orders/tables/${tableId}`}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
      aria-label={`${canStart ? 'Start or view' : 'View'} order for table ${tableNumber}`}
    >
      {canStart ? 'Start / view order' : 'View order'}
    </Link>
  );
}
