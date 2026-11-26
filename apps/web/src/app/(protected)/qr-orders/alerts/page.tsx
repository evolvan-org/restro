'use client';

import { Permission } from '@rms/permissions';
import { type ReactElement, Suspense } from 'react';

import QrAlerts from '@/containers/QrOrders/Alerts';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';

export default function QrAlertsPage(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.QR_ORDER_MANAGE]);
  if (!allowed) return null;
  return (
    <Suspense>
      <QrAlerts />
    </Suspense>
  );
}
