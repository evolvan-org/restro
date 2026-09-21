'use client';

import type { ReactNode } from 'react';

import QueryClientProvider from './QueryClientProvider';
import StoreProvider from './StoreProvider';

/**
 * Composes app-wide providers. Order matters: Redux is outermost (auth state
 * other providers may read from), then TanStack Query for server state.
 */
export default function AppProvider({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <QueryClientProvider>{children}</QueryClientProvider>
    </StoreProvider>
  );
}
