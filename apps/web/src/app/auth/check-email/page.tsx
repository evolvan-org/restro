import { Suspense } from 'react';

import CheckEmail from '@/containers/Auth/CheckEmail';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CheckEmail />
    </Suspense>
  );
}
