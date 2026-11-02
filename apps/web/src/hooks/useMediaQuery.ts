'use client';

import { useSyncExternalStore } from 'react';

/**
 * Subscribe to a CSS media query. SSR-safe: renders as `false` on the server and the first client
 * paint, then syncs to the real match. Prefer the dedicated `useMobileLayout` for the shared
 * 1023px breakpoint; use this for one-off breakpoints like the phone popover/Sheet swap.
 */
export default function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
