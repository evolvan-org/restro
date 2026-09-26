'use client';

import { QueryClient, QueryClientProvider as Provider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

const MAX_RETRIES = 2;
const STALE_TIME = 60_000; // 1 minute

/** Don't retry 404s — the resource genuinely isn't there. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  return failureCount < MAX_RETRIES && status !== 404;
}

/**
 * TanStack Query client (one instance per browser session). Mirrors Yoho's
 * defaults: no refetch-on-focus, bounded retries that skip 404s.
 */
export default function QueryClientProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: STALE_TIME,
            refetchOnWindowFocus: false,
            retry: shouldRetry,
          },
        },
      }),
  );

  return <Provider client={client}>{children}</Provider>;
}
