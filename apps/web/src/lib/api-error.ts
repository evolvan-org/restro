import { errorResponseSchema } from '@rms/api-contract';
import axios from 'axios';

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const parsed = errorResponseSchema.safeParse(error.response?.data);
  if (!parsed.success) {
    return fallback;
  }

  return Array.isArray(parsed.data.message) ? parsed.data.message.join(' ') : parsed.data.message;
}

/**
 * True when the API rejected an auth link (400). Anything else (network failure, 5xx) is transient
 * and should offer a retry with the same token instead of declaring the link dead.
 */
export function isRejectedLinkError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 400;
}
