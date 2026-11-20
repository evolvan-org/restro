import type { Metadata } from 'next';
import { Suspense } from 'react';

import VerifyEmail from '@/containers/Auth/VerifyEmail';

export const metadata: Metadata = { referrer: 'no-referrer' };
export default function Page() {
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  );
}
