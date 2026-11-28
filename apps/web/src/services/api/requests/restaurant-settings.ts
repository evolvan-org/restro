import {
  type RestaurantLogoResponse,
  restaurantLogoResponseSchema,
  type RestaurantSettingsResponse,
  restaurantSettingsResponseSchema,
  type UpdateRestaurantSettingsRequest,
} from '@rms/api-contract';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';
import { useAccessToken } from '@/store/hooks/auth';

import { RestaurantQueryKey } from '../types/RestaurantQueryKey';
import { BILL_QUERY_KEY } from './bills';

export function useRestaurantSettings(): UseQueryResult<RestaurantSettingsResponse> {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: [RestaurantQueryKey.Settings],
    queryFn: async (): Promise<RestaurantSettingsResponse> => {
      const response = await api.get('/restaurant/settings');
      return restaurantSettingsResponseSchema.parse(response.data);
    },
    enabled: Boolean(accessToken),
  });
}

export function useUpdateRestaurantSettings(): UseMutationResult<
  RestaurantSettingsResponse,
  Error,
  UpdateRestaurantSettingsRequest
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to save restaurant settings.');

  return useMutation<RestaurantSettingsResponse, Error, UpdateRestaurantSettingsRequest>({
    mutationFn: async (
      input: UpdateRestaurantSettingsRequest,
    ): Promise<RestaurantSettingsResponse> => {
      const response = await api.patch('/restaurant/settings', input);
      return restaurantSettingsResponseSchema.parse(response.data);
    },
    onError: showApiError,
    onSuccess: async (settings) => {
      queryClient.setQueryData([RestaurantQueryKey.Settings], settings);
      await queryClient.invalidateQueries({ queryKey: [BILL_QUERY_KEY] });
      toast.success('Restaurant settings saved.');
    },
  });
}

const logoKey = ['restaurant-logo'];

export function useRestaurantLogo(): UseQueryResult<RestaurantLogoResponse> {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: logoKey,
    enabled: Boolean(accessToken),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () =>
      restaurantLogoResponseSchema.parse((await api.get('/restaurant/settings/logo')).data),
  });
}

export function useUpdateRestaurantLogo(): UseMutationResult<
  RestaurantLogoResponse,
  Error,
  RestaurantLogoResponse
> {
  const client = useQueryClient();
  const showApiError = useShowApiError('Unable to update restaurant logo.');
  return useMutation<RestaurantLogoResponse, Error, RestaurantLogoResponse>({
    mutationFn: async (input) =>
      restaurantLogoResponseSchema.parse((await api.put('/restaurant/settings/logo', input)).data),
    onError: showApiError,
    onSuccess: (data) => {
      client.setQueryData(logoKey, data);
    },
  });
}
