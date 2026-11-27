'use client';

import Image from 'next/image';
import type { ReactElement } from 'react';

import { useRestaurantLogo } from '@/services/api/requests/restaurant-settings';

export default function RestaurantLogo({ className }: { className?: string }): ReactElement | null {
  const logo = useRestaurantLogo().data?.logo;
  if (!logo) return null;
  return (
    <Image
      alt="Restaurant logo"
      unoptimized
      width={80}
      height={80}
      className={className}
      src={['data:', logo.mimeType, ';base64,', logo.data].join('')}
    />
  );
}
