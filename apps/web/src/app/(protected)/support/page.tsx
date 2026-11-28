import Link from 'next/link';
import type { ReactElement } from 'react';

export default function Support(): ReactElement {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Contact support</h1>
      <p>
        Contact your restaurant administrator for account access, printer setup, or problems using
        Restro.
      </p>
      <Link href="/profile" className="underline">
        View your account details
      </Link>
    </main>
  );
}
