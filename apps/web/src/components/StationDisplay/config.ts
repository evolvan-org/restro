import type { KotDestination, KotStatus } from '@rms/api-contract';
import { ChefHat, GlassWater, type LucideIcon } from 'lucide-react';

export type StationConfig = {
  destination: KotDestination;
  name: string;
  icon: LucideIcon;
  accent: string;
  accentFg: string;
  /** Minutes before a ticket turns amber / red. Configurable in settings in a later story. */
  warnMin: number;
  lateMin: number;
  emptyText: string;
};

export const KITCHEN_STATION: StationConfig = {
  destination: 'KITCHEN',
  name: 'Kitchen',
  icon: ChefHat,
  accent: '#FF8A3D',
  accentFg: '#170A00',
  warnMin: 10,
  lateMin: 20,
  emptyText: 'New kitchen tickets will appear here.',
};

export const BAR_STATION: StationConfig = {
  destination: 'BAR',
  name: 'Bar',
  icon: GlassWater,
  accent: '#8B9CFF',
  accentFg: '#0D0A26',
  warnMin: 5,
  lateMin: 10,
  emptyText: 'New bar tickets will appear here.',
};

export type ActiveKotStatus = Extract<KotStatus, 'PENDING' | 'PREPARING' | 'READY'>;

export const LANES: Record<
  ActiveKotStatus,
  { label: string; action: string; next: Exclude<KotStatus, 'PENDING'>; swatch: string }
> = {
  PENDING: { label: 'New', action: 'Start preparing', next: 'PREPARING', swatch: 'var(--pending)' },
  PREPARING: { label: 'Preparing', action: 'Mark ready', next: 'READY', swatch: 'var(--prep)' },
  READY: { label: 'Ready', action: 'Complete', next: 'COMPLETED', swatch: 'var(--ready)' },
};

export const FILTERS: readonly { key: 'ALL' | ActiveKotStatus; label: string; swatch: string }[] = [
  { key: 'ALL', label: 'All', swatch: 'var(--muted)' },
  { key: 'PENDING', label: 'New', swatch: 'var(--pending)' },
  { key: 'PREPARING', label: 'Preparing', swatch: 'var(--prep)' },
  { key: 'READY', label: 'Ready', swatch: 'var(--ready)' },
];
