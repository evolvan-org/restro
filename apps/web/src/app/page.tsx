'use client';

import { Button } from '@/components/ui/button';
import { useStatus } from '@/services/api/requests/status';
import { useShowSampleModal } from '@/store/hooks/modal';
import { useShowSampleSidePane } from '@/store/hooks/sidepane';

export default function HomePage() {
  const { data, isLoading, isError } = useStatus();
  const showSampleModal = useShowSampleModal();
  const showSampleSidePane = useShowSampleSidePane();

  const online = !isError && data?.status === 'online';
  const label = isLoading ? 'Checking server…' : online ? 'Server is online' : 'Server offline';
  const dotColor = isLoading ? 'bg-muted-foreground' : online ? 'bg-emerald-500' : 'bg-destructive';

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-6 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        Restaurant Management System
      </p>

      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Ready for development</h1>

      <div className="flex items-center gap-2 rounded-full border border-input px-4 py-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} aria-hidden />
        <span className="text-sm font-medium">{label}</span>
      </div>

      {online && data ? (
        <p className="text-xs text-muted-foreground">
          {data.service} · v{data.version}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="outline" onClick={showSampleModal}>
          Open sample modal
        </Button>
        <Button onClick={showSampleSidePane}>Open sample side pane</Button>
      </div>
    </main>
  );
}
