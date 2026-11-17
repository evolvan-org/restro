'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * `useState` that remembers its value in localStorage (per device).
 *
 * - Renders `defaultValue` first and hydrates from storage after mount, so SSR and the first client
 *   render always match.
 * - Only values in `allowed` are accepted from storage; anything else falls back to the default.
 * - Storage can throw (private windows, blocked site data); every access is guarded and the hook
 *   degrades to plain in-memory state.
 */
export default function usePersistedState<T extends string>(
  key: string,
  defaultValue: T,
  allowed: readonly T[],
): readonly [T, (next: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      const match = allowed.find((option) => option === stored);
      if (match) setValue(match);
    } catch {
      // Storage unavailable: keep the default.
    }
    // `allowed` is a static list supplied by the caller; hydrate once per key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T): void => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Ignore: the choice just won't survive a reload.
      }
    },
    [key],
  );

  return [value, update] as const;
}
