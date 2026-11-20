'use client';

import type { ReactElement } from 'react';

import StationDisplay from '@/components/StationDisplay';
import { BAR_STATION } from '@/components/StationDisplay/config';

export default function BarDisplay(): ReactElement | null {
  return <StationDisplay station={BAR_STATION} />;
}
