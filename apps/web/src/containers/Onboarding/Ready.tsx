'use client';

import { Check, MailWarning } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { formatRoleLabel } from '@/lib/utils';

import { plural } from './format';
import { useOnboarding } from './OnboardingProvider';

export default function Ready(): ReactElement | null {
  const router = useRouter();
  const { result } = useOnboarding();

  // The result lives in memory only: after a reload there is nothing to show.
  useEffect(() => {
    if (!result) router.replace('/dashboard');
  }, [result, router]);
  if (!result) return null;

  const { counts, invitations, invitationsHeld } = result;
  const parts = [
    counts.tables ? plural(counts.tables, 'table') : null,
    counts.menuItems ? plural(counts.menuItems, 'menu item') : null,
    counts.stockItems ? plural(counts.stockItems, 'ingredient') : null,
  ].filter(Boolean);
  const unsent = invitations.filter((person) => !person.emailSent);

  return (
    <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="flex w-full max-w-xl flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-8 sm:p-10">
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            <Check className="size-3.5" aria-hidden />
            Setup complete
          </span>
          <h1 className="text-[28px] leading-tight font-bold">{result.restaurantName} is ready</h1>
          {parts.length > 0 && (
            <p className="text-[15px] text-neutral-700">{parts.join(', ')} are set up.</p>
          )}
        </div>

        {invitations.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold">Team invitations</h2>
              <p className="text-sm text-neutral-600">
                {unsent.length === 0
                  ? 'Each person got an email with a link to set their password.'
                  : 'Their accounts are created. Invitations that were not sent can be resent from the Staff page.'}
              </p>
            </div>
            {unsent.length > 0 && (
              <p
                role="status"
                className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
              >
                <MailWarning className="mt-0.5 size-4 flex-none" aria-hidden />
                {invitationsHeld
                  ? 'Invitations are waiting because your own email isn’t verified yet. Verify it, then use Resend invitation on the Staff page.'
                  : 'Some invitation emails could not be sent. Use Resend invitation on the Staff page.'}
              </p>
            )}
            <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-200">
              {invitations.map((person) => (
                <li key={person.userId} className="flex items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold">
                      {person.name} · {formatRoleLabel(person.role)}
                    </span>
                    <span className="truncate text-sm text-neutral-700">{person.email}</span>
                  </div>
                  <span
                    className={`flex-none rounded-full px-2.5 py-1 text-xs font-semibold ${
                      person.emailSent
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-amber-50 text-amber-900'
                    }`}
                  >
                    {person.emailSent ? 'Invitation sent' : 'Not sent yet'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Button className="h-12" onClick={() => router.replace('/dashboard')}>
          Go to dashboard
        </Button>
      </div>
    </main>
  );
}
