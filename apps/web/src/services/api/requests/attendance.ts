import {
  type AttendanceAction,
  attendanceActionSchema,
  type AttendanceCorrection,
  type AttendanceCorrectionList,
  attendanceCorrectionListSchema,
  type AttendanceCorrectionQuery,
  attendanceCorrectionSchema,
  type AttendanceHistory,
  attendanceHistorySchema,
  type AttendanceList,
  attendanceListSchema,
  type AttendanceQuery,
  type AttendanceSession,
  attendanceSessionSchema,
  type CurrentAttendance,
  currentAttendanceSchema,
  type DecideAttendanceCorrection,
  decideAttendanceCorrectionSchema,
  type RequestAttendanceCorrection,
  requestAttendanceCorrectionSchema,
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

const ATTENDANCE = 'attendance';
export function useCurrentAttendance(enabled: boolean): UseQueryResult<CurrentAttendance> {
  return useQuery({
    queryKey: [ATTENDANCE, 'current'],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await api.get('/attendance/current', { signal });
      return currentAttendanceSchema.parse(response.data);
    },
  });
}
export function useAttendanceList(
  query: AttendanceQuery,
  enabled: boolean,
): UseQueryResult<AttendanceList> {
  return useQuery({
    queryKey: [ATTENDANCE, 'list', query],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await api.get('/attendance', { signal, params: query });
      return attendanceListSchema.parse(response.data);
    },
  });
}
export function useAttendanceCorrections(
  query: AttendanceCorrectionQuery,
  enabled: boolean,
): UseQueryResult<AttendanceCorrectionList> {
  return useQuery({
    queryKey: [ATTENDANCE, 'corrections', query],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await api.get('/attendance/corrections', { signal, params: query });
      return attendanceCorrectionListSchema.parse(response.data);
    },
  });
}
export function useAttendanceHistory(id: string, page: number): UseQueryResult<AttendanceHistory> {
  return useQuery({
    queryKey: [ATTENDANCE, 'history', id, page],
    queryFn: async ({ signal }) => {
      const response = await api.get(`/attendance/${id}/history`, {
        signal,
        params: { page, pageSize: 10 },
      });
      return attendanceHistorySchema.parse(response.data);
    },
  });
}
export function useAttendanceAction(): UseMutationResult<
  AttendanceSession,
  Error,
  AttendanceAction
> {
  const client = useQueryClient();
  const showApiError = useShowApiError('Unable to record attendance.');
  return useMutation<AttendanceSession, Error, AttendanceAction>({
    mutationFn: async (input) => {
      const response = await api.post('/attendance/actions', attendanceActionSchema.parse(input));
      return attendanceSessionSchema.parse(response.data);
    },
    onSuccess: async (updated) => {
      await client.cancelQueries({ queryKey: [ATTENDANCE, 'current'] });
      client.setQueryData<CurrentAttendance>([ATTENDANCE, 'current'], {
        data: updated.clockOutAt ? null : updated,
        asOf: updated.asOf,
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: [ATTENDANCE, 'list'] }),
        client.invalidateQueries({ queryKey: [ATTENDANCE, 'history', updated.id] }),
      ]);
    },
    onError: showApiError,
  });
}
export function useRequestAttendanceCorrection(): UseMutationResult<
  AttendanceCorrection,
  Error,
  { id: string; input: RequestAttendanceCorrection }
> {
  const client = useQueryClient();
  const showApiError = useShowApiError('Unable to submit the correction request.');
  return useMutation<
    AttendanceCorrection,
    Error,
    { id: string; input: RequestAttendanceCorrection }
  >({
    mutationFn: async ({ id, input }) => {
      const response = await api.post(
        `/attendance/${id}/corrections`,
        requestAttendanceCorrectionSchema.parse(input),
      );
      return attendanceCorrectionSchema.parse(response.data);
    },
    onSuccess: async (updated) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: [ATTENDANCE, 'corrections'] }),
        client.invalidateQueries({ queryKey: [ATTENDANCE, 'history', updated.sessionId] }),
      ]);
    },
    onError: showApiError,
  });
}
export function useDecideAttendanceCorrection(): UseMutationResult<
  AttendanceCorrection,
  Error,
  { id: string; input: DecideAttendanceCorrection }
> {
  const client = useQueryClient();
  const showApiError = useShowApiError('Unable to record the correction decision.');
  return useMutation<
    AttendanceCorrection,
    Error,
    { id: string; input: DecideAttendanceCorrection }
  >({
    mutationFn: async ({ id, input }) => {
      const response = await api.post(
        `/attendance/corrections/${id}/decision`,
        decideAttendanceCorrectionSchema.parse(input),
      );
      return attendanceCorrectionSchema.parse(response.data);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: [ATTENDANCE] });
    },
    onError: showApiError,
  });
}
