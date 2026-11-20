'use client';

import { useCallback, useEffect, useState } from 'react';

export type KdsTheme = 'dark' | 'light';

/** Wall-clock `Date.now()` that re-renders its consumer once per second. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Dark by default; the choice is remembered per station. Storage access is best-effort. */
export function useStationTheme(stationKey: string): [KdsTheme, () => void] {
  const storageKey = `rms-kds-theme-${stationKey.toLowerCase()}`;
  const [theme, setTheme] = useState<KdsTheme>('dark');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === 'dark' || stored === 'light') setTheme(stored);
    } catch {
      // Storage unavailable: keep the default.
    }
  }, [storageKey]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Not persisted; the toggle still works for this session.
      }
      return next;
    });
  }, [storageKey]);

  return [theme, toggle];
}

export function useFullscreen(): [boolean, () => void] {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = (): void => setActive(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }, []);

  return [active, toggle];
}
