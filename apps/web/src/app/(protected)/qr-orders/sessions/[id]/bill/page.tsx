'use client';

import { Permission } from '@rms/permissions';
import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';

import QrBillView from '@/containers/QrOrders/BillView';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';

export default function QrBillPage(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.QR_ORDER_READ]);
  const { id } = useParams<{ id: string }>();
  if (!allowed) return null;
  return <QrBillView sessionId={id} />;
}
