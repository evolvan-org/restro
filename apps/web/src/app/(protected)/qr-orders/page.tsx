'use client';

import { Permission } from '@rms/permissions';
import type { ReactElement } from 'react';

import QrOrdersQueue from '@/containers/QrOrders';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';

export default function QrOrdersPage(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.QR_ORDER_READ]);
  if (!allowed) return null;
  return <QrOrdersQueue />;
}
