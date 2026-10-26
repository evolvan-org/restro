import axios from 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** The caller renders the failure inline with its own retry control. */
    errorDisplay?: 'inline';
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_URL,
});
