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
  return useMutation({
    mutationFn: async (input): Promise<DiningSection> => {
      const response = await api.post('/dining-sections', input);
      return diningSectionSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DiningSectionQueryKey.Sections] }),
  });
}

export function useUpdateDiningSection(): UseMutationResult<DiningSection, Error, UpdateVariables> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }): Promise<DiningSection> => {
      const response = await api.patch(`/dining-sections/${id}`, input);
      return diningSectionSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DiningSectionQueryKey.Sections] }),
  });
}

export function useUpdateDiningSectionStatus(): UseMutationResult<
  DiningSection,
  Error,
  UpdateStatusVariables
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }): Promise<DiningSection> => {
      const response = await api.patch(`/dining-sections/${id}/status`, input);
      return diningSectionSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DiningSectionQueryKey.Sections] }),
  });
}

export function useReorderDiningSections(): UseMutationResult<
  ReorderDiningSectionsResponse,
  Error,
  ReorderDiningSectionsRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input): Promise<ReorderDiningSectionsResponse> => {
      const response = await api.patch('/dining-sections/reorder', input);
      return reorderDiningSectionsResponseSchema.parse(response.data);
    },
    onSuccess: (sections) => {
      queryClient.setQueryData([DiningSectionQueryKey.Sections], sections);
    },
  });
}

export function useDeleteDiningSection(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id): Promise<void> => {
      await api.delete(`/dining-sections/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DiningSectionQueryKey.Sections] }),
  });
}
