import {
  messageResponseSchema,
  type ThermalCheckRequest,
  thermalConfigurationSchema,
  type ThermalDestination,
  thermalDocumentSchema,
  type ThermalKind,
  thermalPrinterStatusSchema,
  type ThermalPrintRequest,
  type ThermalSettings,
  type ThermalTestRequest,
} from '@rms/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';

export function useThermalDocument(kind: ThermalKind, id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['thermal-document', kind, id],
    enabled,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () =>
      thermalDocumentSchema.parse((await api.get(['/thermal-printing', kind, id].join('/'))).data),
  });
}

export function useDirectThermalPrint(kind: ThermalKind, id: string) {
  const showError = useShowApiError('Unable to send the print job.');
  return useMutation({
    mutationFn: async (input: ThermalPrintRequest) => {
      const { data } = await api.post(['/thermal-printing', kind, id].join('/'), input);
      return messageResponseSchema.parse(data);
    },
    onError: showError,
    onSuccess: ({ message }) => {
      toast.success(message);
    },
  });
}

export function useThermalPrinterStatus() {
  return useQuery({
    queryKey: ['thermal-printer-status'],
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () =>
      thermalPrinterStatusSchema.parse((await api.get('/thermal-printing/config')).data),
  });
}

export function useThermalTestPrint() {
  const showError = useShowApiError('Unable to send the test slip.');
  return useMutation({
    mutationFn: async (input: ThermalTestRequest) =>
      messageResponseSchema.parse((await api.post('/thermal-printing/test', input)).data),
    onError: showError,
    onSuccess: ({ message }) => {
      toast.success(message);
    },
  });
}

export function useUpdateThermalSettings() {
  const client = useQueryClient();
  const showError = useShowApiError('Unable to save printer settings.');
  return useMutation({
    mutationFn: async ({
      destination,
      settings,
    }: {
      destination: ThermalDestination;
      settings: ThermalSettings;
    }) =>
      thermalConfigurationSchema.parse(
        (await api.put('/thermal-printing/config/' + destination, settings)).data,
      ),
    onError: showError,
    onSuccess: async () => {
      toast.success('Printer settings saved.');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['thermal-printer-status'] }),
        client.invalidateQueries({ queryKey: ['thermal-document'] }),
      ]);
    },
  });
}

export function useCheckThermalConnection() {
  const showError = useShowApiError('Unable to reach the printer.');
  return useMutation({
    mutationFn: async (input: ThermalCheckRequest) =>
      messageResponseSchema.parse((await api.post('/thermal-printing/check', input)).data),
    onError: showError,
  });
}
