'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * `useState` that remembers its value in localStorage (per device).
 *
 * - Renders `defaultValue` first and hydrates from storage after mount, so SSR and the first client
 *   render always match.
 * - Only values in `allowed` are accepted from storage; anything else falls back to the default.
 * - The third return value reports whether the initial preference has been resolved.
 * - Storage can throw (private windows, blocked site data); every access is guarded and the hook
 *   degrades to plain in-memory state.
 */
export default function usePersistedState<T extends string>(
  key: string,
  defaultValue: T,
  allowed: readonly T[],
): readonly [T, (next: T) => void, boolean] {
  const [value, setValue] = useState<T>();

  useEffect(() => {
    let restoredValue = defaultValue;
    try {
      const stored = window.localStorage.getItem(key);
      restoredValue = allowed.find((option) => option === stored) ?? defaultValue;
    } catch {
      // Storage unavailable: keep the default.
    }
    setValue(restoredValue);
  }, [allowed, defaultValue, key]);

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

  return [value ?? defaultValue, update, value !== undefined] as const;
}
