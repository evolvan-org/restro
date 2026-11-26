'use client';

import { Permission } from '@rms/permissions';
import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';

import QrRoundReview from '@/containers/QrOrders/Review';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';

export default function QrRoundPage(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.QR_ORDER_READ]);
  const { id } = useParams<{ id: string }>();
  if (!allowed) return null;
  return <QrRoundReview roundId={id} />;
}
