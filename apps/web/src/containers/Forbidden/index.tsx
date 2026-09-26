import { ShieldX } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { buttonVariants } from '@/components/ui/button';

/** Shown when an authenticated user is denied a page by the permission guard (AC4). */
export default function Forbidden(): ReactElement {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldX className="size-7" aria-hidden />
      </div>
      <p className="mt-6 text-sm font-medium text-muted-foreground">403 — Forbidden</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Access denied</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You don&apos;t have permission to view this page. If you think this is a mistake, contact
        your restaurant owner or manager.
      </p>
      <Link href="/dashboard" className={buttonVariants({ className: 'mt-6' })}>
        Back to dashboard
      </Link>
    </main>
  );
}
