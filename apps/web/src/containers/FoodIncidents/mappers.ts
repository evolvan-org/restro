import { addFoodIncidentEntrySchema, type CreateFoodIncident } from '@rms/api-contract';
import { z } from 'zod';

import type { IncidentCommand } from '@/services/api/requests/food-incidents';

export const responseSchema = addFoodIncidentEntrySchema.pick({ note: true }).extend({
  kind: z.enum(['NOTE', 'DECISION', 'CORRECTIVE_ACTION', 'RESOLVE']),
});
export type ResponseForm = z.infer<typeof responseSchema>;
export function incidentDefaults(): CreateFoodIncident {
  return { title: '', description: '', batchIds: [] };
}
export function responseDefaults(): ResponseForm {
  return { kind: 'NOTE', note: '' };
}
export function responseCommand(
  id: string,
  expectedVersion: number,
  values: ResponseForm,
): IncidentCommand {
  return values.kind === 'RESOLVE'
    ? { action: 'resolve', id, input: { expectedVersion, note: values.note } }
    : { action: 'append', id, input: { expectedVersion, note: values.note, kind: values.kind } };
}
