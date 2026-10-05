import {
  type CreateDiningSectionRequest,
  type DiningSection,
  diningSectionListResponseSchema,
  diningSectionSchema,
  type ReorderDiningSectionsRequest,
  type ReorderDiningSectionsResponse,
  reorderDiningSectionsResponseSchema,
  type UpdateDiningSectionRequest,
  type UpdateDiningSectionStatusRequest,
} from '@rms/api-contract';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';

import { DiningSectionQueryKey } from '../types/DiningSectionQueryKey';

const PAGE_SIZE = 100;

type UpdateVariables = { id: string; input: UpdateDiningSectionRequest };
type UpdateStatusVariables = { id: string; input: UpdateDiningSectionStatusRequest };

/** Loads every page so ordering controls always operate on the complete restaurant list. */
export function useDiningSections(enabled: boolean): UseQueryResult<DiningSection[]> {
  return useQuery({
    queryKey: [DiningSectionQueryKey.Sections],
    queryFn: async (): Promise<DiningSection[]> => {
      const sections: DiningSection[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const response = await api.get('/dining-sections', {
          params: { page, pageSize: PAGE_SIZE },
        });
        const parsed = diningSectionListResponseSchema.parse(response.data);
        sections.push(...parsed.data);
        totalPages = parsed.meta.totalPages;
        page += 1;
      } while (page <= totalPages);

      return sections;
    },
    enabled,
  });
}

export function useCreateDiningSection(): UseMutationResult<
  DiningSection,
  Error,
  CreateDiningSectionRequest
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to create the dining section.');
  return useMutation<DiningSection, Error, CreateDiningSectionRequest>({
    mutationFn: async (input): Promise<DiningSection> => {
      const response = await api.post('/dining-sections', input);
      return diningSectionSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DiningSectionQueryKey.Sections] }),
    onError: showApiError,
  });
}

export function useUpdateDiningSection(): UseMutationResult<DiningSection, Error, UpdateVariables> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to update the dining section.');
  return useMutation<DiningSection, Error, UpdateVariables>({
    mutationFn: async ({ id, input }): Promise<DiningSection> => {
      const response = await api.patch(`/dining-sections/${id}`, input);
      return diningSectionSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DiningSectionQueryKey.Sections] }),
    onError: showApiError,
  });
}

export function useUpdateDiningSectionStatus(): UseMutationResult<
  DiningSection,
  Error,
  UpdateStatusVariables
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to change the section status.');
  return useMutation<DiningSection, Error, UpdateStatusVariables>({
    mutationFn: async ({ id, input }): Promise<DiningSection> => {
      const response = await api.patch(`/dining-sections/${id}/status`, input);
      return diningSectionSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DiningSectionQueryKey.Sections] }),
    onError: showApiError,
  });
}

export function useReorderDiningSections(): UseMutationResult<
  ReorderDiningSectionsResponse,
  Error,
  ReorderDiningSectionsRequest
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to save the new section order.');
  return useMutation<ReorderDiningSectionsResponse, Error, ReorderDiningSectionsRequest>({
    mutationFn: async (input): Promise<ReorderDiningSectionsResponse> => {
      const response = await api.patch('/dining-sections/reorder', input);
      return reorderDiningSectionsResponseSchema.parse(response.data);
    },
    onSuccess: (sections) => {
      queryClient.setQueryData([DiningSectionQueryKey.Sections], sections);
    },
    onError: showApiError,
  });
}

export function useArchiveDiningSection(): UseMutationResult<DiningSection, Error, string> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to archive the dining section.');
  return useMutation<DiningSection, Error, string>({
    mutationFn: async (id): Promise<DiningSection> => {
      const response = await api.patch(`/dining-sections/${id}/archive`);
      return diningSectionSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DiningSectionQueryKey.Sections] }),
    onError: showApiError,
  });
}
