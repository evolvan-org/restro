'use client';

import { usePathname } from 'next/navigation';

/** Which shell the app renders for the current route. */
export type AppLayoutVariant = 'app-shell' | 'bare';

type RouteMatcher = { path: string; match: 'exact' | 'prefix' };

/**
 * Routes that render WITHOUT the app shell (no sidebar, no header). Everything else gets the full
 * shell. This is the single source of truth — excluding a route is a one-line change here, not a
 * layout rewrite. Only routes that actually mount the protected shell need listing; `/` and
 * `/auth/*` render under their own layouts today, but they stay here so the decision lives in one
 * place if the route tree changes.
 */
const BARE_ROUTES: readonly RouteMatcher[] = [
  { path: '/', match: 'exact' },
  { path: '/auth', match: 'prefix' },
  { path: '/forbidden', match: 'exact' },
];

function matchesRoute(pathname: string, matcher: RouteMatcher): boolean {
  if (matcher.match === 'exact') {
    return pathname === matcher.path;
  }
  return pathname === matcher.path || pathname.startsWith(`${matcher.path}/`);
}

/**
 * Decides, from the current pathname, which layout the app shell should render. Consumed by the
 * protected layout so no page branches on its own chrome.
 */
export default function useAppLayout(): { variant: AppLayoutVariant } {
  const pathname = usePathname();
  const isBare = BARE_ROUTES.some((matcher) => matchesRoute(pathname, matcher));
  return { variant: isBare ? 'bare' : 'app-shell' };
}
