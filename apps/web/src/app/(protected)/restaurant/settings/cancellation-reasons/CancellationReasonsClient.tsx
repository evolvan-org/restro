'use client';

import { Permission } from '@rms/permissions';
import type { ReactElement } from 'react';

import BillCancellationReasons from '@/containers/RestaurantSettings/BillCancellationReasons';
import usePermissions from '@/hooks/auth/usePermissions';

export default function CancellationReasonsClient(): ReactElement {
  const { can } = usePermissions();
  const canEdit = can(Permission.RESTAURANT_WRITE);

  return (
    <div className="w-full">
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight">Cancellation reasons</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Define authorized reasons staff can select when cancelling bills or line items.
        </p>
      </div>
      <BillCancellationReasons canEdit={canEdit} />
    </div>
  );
}
