import {
  type CancelOperatingTask,
  cancelOperatingTaskSchema,
  type CreateOperatingTask,
  createOperatingTaskSchema,
  type OperatingTask,
  type OperatingTaskAssignees,
  operatingTaskAssigneesSchema,
  type OperatingTaskHistory,
  operatingTaskHistorySchema,
  type OperatingTaskList,
  operatingTaskListSchema,
  type OperatingTaskQuery,
  operatingTaskSchema,
  type RecordOperatingTask,
  recordOperatingTaskSchema,
  type ResolveOperatingTask,
  resolveOperatingTaskSchema,
  type UpdateOperatingTask,
  updateOperatingTaskSchema,
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

const TASKS = 'operating-tasks';
export function useOperatingTasks(
  query: OperatingTaskQuery,
  enabled: boolean,
): UseQueryResult<OperatingTaskList> {
  return useQuery({
    queryKey: [TASKS, 'list', query],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await api.get('/operating-tasks', { params: query, signal });
      return operatingTaskListSchema.parse(response.data);
    },
  });
}
export function useOperatingTaskAssignees(
  enabled: boolean,
): UseQueryResult<OperatingTaskAssignees> {
  return useQuery({
    queryKey: [TASKS, 'assignees'],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await api.get('/operating-tasks/assignees', { signal });
      return operatingTaskAssigneesSchema.parse(response.data);
    },
  });
}
export function useOperatingTaskHistory(
  id: string,
  page: number,
): UseQueryResult<OperatingTaskHistory> {
  return useQuery({
    queryKey: [TASKS, 'history', id, page],
    queryFn: async ({ signal }) => {
      const response = await api.get(`/operating-tasks/${id}/history`, {
        params: { page, pageSize: 10 },
        signal,
      });
      return operatingTaskHistorySchema.parse(response.data);
    },
  });
}
export type TaskMutation =
  | { action: 'create'; input: CreateOperatingTask }
  | { action: 'update'; id: string; input: UpdateOperatingTask }
  | { action: 'record'; id: string; input: RecordOperatingTask }
  | { action: 'cancel'; id: string; input: CancelOperatingTask }
  | { action: 'resolve'; id: string; input: ResolveOperatingTask };

export function useSaveOperatingTask(): UseMutationResult<OperatingTask, Error, TaskMutation> {
  const client = useQueryClient();
  const showApiError = useShowApiError('Unable to save the operating check.');
  return useMutation<OperatingTask, Error, TaskMutation>({
    mutationFn: async (variables) => {
      let response;
      switch (variables.action) {
        case 'create':
          response = await api.post(
            '/operating-tasks',
            createOperatingTaskSchema.parse(variables.input),
          );
          break;
        case 'update':
          response = await api.patch(
            `/operating-tasks/${variables.id}`,
            updateOperatingTaskSchema.parse(variables.input),
          );
          break;
        case 'record':
          response = await api.post(
            `/operating-tasks/${variables.id}/record`,
            recordOperatingTaskSchema.parse(variables.input),
          );
          break;
        case 'cancel':
          response = await api.post(
            `/operating-tasks/${variables.id}/cancel`,
            cancelOperatingTaskSchema.parse(variables.input),
          );
          break;
        case 'resolve':
          response = await api.post(
            `/operating-tasks/${variables.id}/resolve`,
            resolveOperatingTaskSchema.parse(variables.input),
          );
          break;
      }
      return operatingTaskSchema.parse(response.data);
    },
    onSuccess: async (updated) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: [TASKS, 'list'] }),
        client.invalidateQueries({ queryKey: [TASKS, 'history', updated.id] }),
      ]);
    },
    onError: showApiError,
  });
}
