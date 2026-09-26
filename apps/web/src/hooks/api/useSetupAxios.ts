import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import store from '@/store';
import { useLogout } from '@/store/hooks/auth';

/** The API's standard error envelope (see the global HttpExceptionFilter). */
type ApiErrorBody = { message?: string };

const FORBIDDEN_FALLBACK = 'You do not have permission to perform this action';
const SERVER_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Registers interceptors on the shared axios instance. Mounted once from the
 * app shell:
 *
 * - **request** — injects `Authorization: Bearer <accessToken>` on every
 *   request. The token is read live via `store.getState()` (not a React
 *   selector), so each request always carries the current token without the
 *   interceptor needing to re-register when it changes.
 * - **response** — on a 401 the session is stale, so we clear auth + cached
 *   server data, bouncing the user back to login.
 *
 * Interceptors are ejected on unmount so fast-refresh / remounts don't stack
 * duplicates on the singleton instance.
 */
export default function useSetupAxios(instance: AxiosInstance) {
  // `useLogout` returns a fresh closure each render; keep it in a ref so the
  // effect can register interceptors once (`[instance]`) yet always call the
  // latest logout.
  const logout = useLogout();
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  useEffect(() => {
    const requestInterceptor = instance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const {
          auth: { accessToken },
        } = store.getState();

        if (accessToken) {
          config.headers.Authorization = `Bearer ${accessToken}`;
        }

        return config;
      },
      (error: AxiosError) => Promise.reject(error),
    );

    const responseInterceptor = instance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const status = error.response?.status;

        if (status === 401) {
          logoutRef.current();
        } else if (status === 403) {
          // Authorization denied on an action — surface the reason (AC4).
          const message = (error.response?.data as ApiErrorBody | undefined)?.message;
          toast.error(message ?? FORBIDDEN_FALLBACK);
        } else if (status !== undefined && status >= 500) {
          toast.error(SERVER_ERROR_MESSAGE);
        }

        return Promise.reject(error);
      },
    );

    return () => {
      instance.interceptors.request.eject(requestInterceptor);
      instance.interceptors.response.eject(responseInterceptor);
    };
  }, [instance]);
}
