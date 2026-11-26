'use client';

import { Permission } from '@rms/permissions';
import type { ReactElement } from 'react';

import QrSettings from '@/containers/QrSettings';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';

export default function QrOrderingSettingsPage(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.SETTINGS_READ]);
  if (!allowed) return null;
  return <QrSettings />;
}
