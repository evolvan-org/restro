import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api-error';

export default function QueryState({
  pending,
  error,
  retry,
}: {
  pending: boolean;
  error: Error | null;
  retry: () => void;
}): ReactElement | null {
  if (pending)
    return (
      <p role="status" className="p-6 text-sm text-muted-foreground">
        Loading billing data…
      </p>
    );
  if (error)
    return (
      <div role="alert" className="space-y-3 rounded-lg border p-6">
        <p className="text-sm text-destructive">
          {getApiErrorMessage(error, 'Unable to load billing data.')}
        </p>
        <Button variant="outline" className="min-h-11 rounded-xl px-4" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  return null;
}
