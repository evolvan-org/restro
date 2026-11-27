import { type ReactElement, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import useShowApiError from '@/hooks/api/useShowApiError';
import { useInventoryReceipt } from '@/services/api/requests/inventory';

import { InventoryDialog } from '../Inventory/form-controls';
import { ReceiptDetails } from '../Inventory/purchase-forms';

export default function IncidentReceipt({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}): ReactElement {
  const query = useInventoryReceipt(id);
  const showApiError = useShowApiError('Unable to load the goods receipt.');
  useEffect(() => {
    if (query.error) showApiError(query.error);
  }, [query.error, query.errorUpdatedAt, showApiError]);
  if (query.data && !query.isError)
    return <ReceiptDetails receipt={query.data} onClose={onClose} />;
  return (
    <InventoryDialog
      title="Goods receipt"
      description="Receipt linked to the incident batch."
      onClose={onClose}
    >
      {query.isPending && <p role="status">Loading goods receipt…</p>}
      {query.isError && (
        <div className="space-y-3">
          <p role="alert">Unable to load this goods receipt.</p>
          <Button type="button" variant="outline" onClick={() => void query.refetch()}>
            Retry receipt
          </Button>
        </div>
      )}
    </InventoryDialog>
  );
}
