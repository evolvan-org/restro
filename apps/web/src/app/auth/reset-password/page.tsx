import type { Metadata } from 'next';
import { Suspense } from 'react';

import TokenPassword from '@/containers/Auth/TokenPassword';

export const metadata: Metadata = { referrer: 'no-referrer' };
export default function Page() {
  return (
    <Suspense fallback={null}>
      <TokenPassword mode="reset" />
    </Suspense>
  );
}
