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
