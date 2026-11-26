'use client';

import { useParams } from 'next/navigation';
import { type ReactElement, Suspense } from 'react';

import GuestOrdering from '@/containers/GuestOrdering';

export default function GuestTablePage(): ReactElement {
  const { token } = useParams<{ token: string }>();
  return (
    <Suspense>
      <GuestOrdering token={token} />
    </Suspense>
  );
}
