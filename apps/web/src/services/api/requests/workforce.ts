import {
  type AvailabilityQuery,
  type CancelWorkforceRecord,
  cancelWorkforceRecordSchema,
  type CreateStaffAvailability,
  createStaffAvailabilitySchema,
  type CreateStaffShift,
  createStaffShiftSchema,
  type DecideStaffLeave,
  decideStaffLeaveSchema,
  type ReplaceStaffShift,
  replaceStaffShiftSchema,
  type RequestStaffLeave,
  requestStaffLeaveSchema,
  type ShiftQuery,
  type StaffAvailability,
  type StaffAvailabilityList,
  staffAvailabilityListSchema,
  staffAvailabilitySchema,
  type StaffLeave,
  type StaffLeaveList,
  staffLeaveListSchema,
  type StaffLeaveQuery,
  staffLeaveSchema,
  type StaffShift,
  type StaffShiftList,
  staffShiftListSchema,
  staffShiftSchema,
  type UpdateStaffAvailability,
  updateStaffAvailabilitySchema,
  type UpdateStaffShift,
  updateStaffShiftSchema,
  type WorkforceHistory,
  workforceHistorySchema,
  type WorkforceSnapshot,
  type WorkforceStaff,
  workforceStaffSchema,
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

const KEY = 'workforce';
export function useWorkforceStaff(enabled: boolean): UseQueryResult<WorkforceStaff> {
  return useQuery({
    queryKey: [KEY, 'staff'],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await api.get('/workforce/staff', { signal });
      return workforceStaffSchema.parse(response.data);
    },
  });
}
export function useStaffShifts(
  query: ShiftQuery,
  enabled: boolean,
): UseQueryResult<StaffShiftList> {
  return useQuery({
    queryKey: [KEY, 'shifts', query],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await api.get('/workforce/shifts', { signal, params: query });
      return staffShiftListSchema.parse(response.data);
    },
  });
}
export function useStaffAvailability(
  query: AvailabilityQuery,
  enabled: boolean,
): UseQueryResult<StaffAvailabilityList> {
  return useQuery({
    queryKey: [KEY, 'availability', query],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await api.get('/workforce/availability', { signal, params: query });
      return staffAvailabilityListSchema.parse(response.data);
    },
  });
}
export function useStaffLeave(
  query: StaffLeaveQuery,
  enabled: boolean,
): UseQueryResult<StaffLeaveList> {
  return useQuery({
    queryKey: [KEY, 'leave', query],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await api.get('/workforce/leave', { signal, params: query });
      return staffLeaveListSchema.parse(response.data);
    },
  });
}
export function useWorkforceHistory(
  entity: WorkforceSnapshot['entity'],
  id: string,
  page: number,
): UseQueryResult<WorkforceHistory> {
  return useQuery({
    queryKey: [KEY, 'history', entity, id, page],
    queryFn: async ({ signal }) => {
      const response = await api.get(`/workforce/${entity}/${id}/history`, {
        signal,
        params: { page, pageSize: 10 },
      });
      return workforceHistorySchema.parse(response.data);
    },
  });
}
export type WorkforceMutation =
  | { action: 'create-shift'; input: CreateStaffShift }
  | { action: 'update-shift'; id: string; input: UpdateStaffShift }
  | { action: 'replace-shift'; id: string; input: ReplaceStaffShift }
  | { action: 'cancel-shift'; id: string; input: CancelWorkforceRecord }
  | { action: 'create-availability'; input: CreateStaffAvailability }
  | { action: 'update-availability'; id: string; input: UpdateStaffAvailability }
  | { action: 'archive-availability'; id: string; input: CancelWorkforceRecord }
  | { action: 'request-leave'; input: RequestStaffLeave }
  | { action: 'decide-leave'; id: string; input: DecideStaffLeave }
  | { action: 'cancel-leave'; id: string; input: CancelWorkforceRecord };
export function useSaveWorkforce(): UseMutationResult<
  StaffShift | StaffAvailability | StaffLeave,
  Error,
  WorkforceMutation
> {
  const client = useQueryClient();
  const showApiError = useShowApiError('Unable to save the staff schedule change.');
  return useMutation<StaffShift | StaffAvailability | StaffLeave, Error, WorkforceMutation>({
    mutationFn: async (variables) => {
      switch (variables.action) {
        case 'create-shift':
          return staffShiftSchema.parse(
            (await api.post('/workforce/shifts', createStaffShiftSchema.parse(variables.input)))
              .data,
          );
        case 'update-shift':
          return staffShiftSchema.parse(
            (
              await api.patch(
                `/workforce/shifts/${variables.id}`,
                updateStaffShiftSchema.parse(variables.input),
              )
            ).data,
          );
        case 'replace-shift':
          return staffShiftSchema.parse(
            (
              await api.post(
                `/workforce/shifts/${variables.id}/replacement`,
                replaceStaffShiftSchema.parse(variables.input),
              )
            ).data,
          );
        case 'cancel-shift':
          return staffShiftSchema.parse(
            (
              await api.post(
                `/workforce/shifts/${variables.id}/cancel`,
                cancelWorkforceRecordSchema.parse(variables.input),
              )
            ).data,
          );
        case 'create-availability':
          return staffAvailabilitySchema.parse(
            (
              await api.post(
                '/workforce/availability',
                createStaffAvailabilitySchema.parse(variables.input),
              )
            ).data,
          );
        case 'update-availability':
          return staffAvailabilitySchema.parse(
            (
              await api.patch(
                `/workforce/availability/${variables.id}`,
                updateStaffAvailabilitySchema.parse(variables.input),
              )
            ).data,
          );
        case 'archive-availability':
          return staffAvailabilitySchema.parse(
            (
              await api.post(
                `/workforce/availability/${variables.id}/archive`,
                cancelWorkforceRecordSchema.parse(variables.input),
              )
            ).data,
          );
        case 'request-leave':
          return staffLeaveSchema.parse(
            (await api.post('/workforce/leave', requestStaffLeaveSchema.parse(variables.input)))
              .data,
          );
        case 'decide-leave':
          return staffLeaveSchema.parse(
            (
              await api.post(
                `/workforce/leave/${variables.id}/decision`,
                decideStaffLeaveSchema.parse(variables.input),
              )
            ).data,
          );
        case 'cancel-leave':
          return staffLeaveSchema.parse(
            (
              await api.post(
                `/workforce/leave/${variables.id}/cancel`,
                cancelWorkforceRecordSchema.parse(variables.input),
              )
            ).data,
          );
      }
    },
    onSuccess: async () => {
      await Promise.all(
        ['shifts', 'availability', 'leave', 'history'].map((domain) =>
          client.invalidateQueries({ queryKey: [KEY, domain] }),
        ),
      );
    },
    onError: showApiError,
  });
}
