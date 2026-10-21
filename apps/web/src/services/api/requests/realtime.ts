import {
  type PusherAuthorizeRequest,
  pusherAuthorizeRequestSchema,
  type PusherAuthorizeResponse,
  pusherAuthorizeResponseSchema,
  type PusherClientConfig,
  pusherClientConfigSchema,
} from '@rms/api-contract';

import { api } from '@/lib/api';

export async function getPusherConfig(
  accessToken: string,
  signal: AbortSignal,
): Promise<PusherClientConfig> {
  const response = await api.get('/realtime/config', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  return pusherClientConfigSchema.parse(response.data);
}

export async function authorizePusherChannel(
  input: PusherAuthorizeRequest,
  accessToken: string,
): Promise<PusherAuthorizeResponse> {
  const response = await api.post('/realtime/auth', pusherAuthorizeRequestSchema.parse(input), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return pusherAuthorizeResponseSchema.parse(response.data);
}
