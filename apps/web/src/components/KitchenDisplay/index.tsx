'use client';

import type { ReactElement } from 'react';

import StationDisplay from '@/components/StationDisplay';
import { KITCHEN_STATION } from '@/components/StationDisplay/config';

export default function KitchenDisplay(): ReactElement | null {
  return <StationDisplay station={KITCHEN_STATION} />;
}
