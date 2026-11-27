import type {
  StaffAvailability,
  StaffLeave,
  StaffShift,
  WorkforceSnapshot,
} from '@rms/api-contract';

export type WorkforceActionSelection =
  | { action: 'replace-shift' | 'cancel-shift'; record: StaffShift }
  | { action: 'archive-availability'; record: StaffAvailability }
  | { action: 'decide-leave' | 'cancel-leave'; record: StaffLeave };
export type WorkforceSelection =
  | { kind: 'shift'; record?: StaffShift }
  | { kind: 'availability'; record?: StaffAvailability }
  | { kind: 'leave' }
  | { kind: 'action'; selection: WorkforceActionSelection }
  | { kind: 'history'; entity: WorkforceSnapshot['entity']; id: string; name: string };
