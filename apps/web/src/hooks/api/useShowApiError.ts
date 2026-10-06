import axios from 'axios';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { getApiErrorMessage } from '@/lib/api-error';

const DEFAULT_FALLBACK = 'Something went wrong. Please try again.';

/**
 * Returns a stable callback that surfaces an API error as a toast. Drop it
 * straight into TanStack Query's `onError`, or call it from a `catch` block.
 *
 * The message is extracted from the standard error envelope via
 * `getApiErrorMessage` (handles both single- and multi-message validation
 * errors), falling back to a generic notice when the error isn't a recognised
 * API error.
 *
 * The returned callback takes only the error, so it drops straight into
 * `onError` (TanStack passes `(error, variables, context)` — the extra args are
 * harmless here). Pass a context-specific `fallback` to the hook itself.
 *
 * ```ts
 * const showApiError = useShowApiError();
 * useMutation({ mutationFn, onError: showApiError });
 *
 * // with a context-specific fallback:
 * const showApiError = useShowApiError('Could not update profile');
 * ```
 *
 * Note: global 401/403/5xx handling already lives in `useSetupAxios`. Use this
 * hook for the per-request errors that interceptor intentionally passes through
 * (e.g. 400 validation, 404, 409 conflicts).
 */
export default function useShowApiError(fallback: string = DEFAULT_FALLBACK) {
  return useCallback(
    (error: unknown): void => {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403 || (status !== undefined && status >= 500)) {
          return;
        }
      }
      toast.error(getApiErrorMessage(error, fallback));
    },
    [fallback],
  );
}
