'use client';

import { useQuery } from '@tanstack/react-query';
import { getStatus } from '@/lib/api';

export default function HomePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['status'],
    queryFn: getStatus,
    retry: 1,
  });

  const online = !isError && data?.status === 'online';
  const label = isLoading ? 'Checking server…' : online ? 'Server is online' : 'Server offline';
  const dotColor = isLoading
    ? 'bg-muted-foreground'
    : online
      ? 'bg-emerald-500'
      : 'bg-destructive';

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-16 text-center">
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
    </main>
  );
}
