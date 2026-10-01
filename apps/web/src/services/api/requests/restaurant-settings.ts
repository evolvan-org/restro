import {
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

import { api } from '@/lib/api';
import { useAccessToken } from '@/store/hooks/auth';

import { RestaurantQueryKey } from '../types/RestaurantQueryKey';

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

  return useMutation({
    mutationFn: async (
      input: UpdateRestaurantSettingsRequest,
    ): Promise<RestaurantSettingsResponse> => {
      const response = await api.patch('/restaurant/settings', input);
      return restaurantSettingsResponseSchema.parse(response.data);
    },
    onSuccess: (settings) => {
      queryClient.setQueryData([RestaurantQueryKey.Settings], settings);
    },
  });
}
