'use client';

import { useSyncExternalStore } from 'react';

const MOBILE_LAYOUT_QUERY = '(max-width: 1023px)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(MOBILE_LAYOUT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export default function useMobileLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
