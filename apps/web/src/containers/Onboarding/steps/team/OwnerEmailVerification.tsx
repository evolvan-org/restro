'use client';

import { CircleCheck, RefreshCw, TriangleAlert } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api-error';
import { useResendVerification } from '@/services/api/requests/auth';
import { useProfile } from '@/services/api/requests/profile';

/**
 * Team step notice about the owner's own email: invitations are held until it is verified. Re-checks
 * by itself (every few seconds and on returning to the tab), so it turns green moments after the
 * owner clicks the emailed link, with Resend and Check again for when the email didn't arrive.
 */
export function OwnerEmailVerification(): ReactElement | null {
  const profile = useProfile({ pollUntilVerified: true });
  const resend = useResendVerification();
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'bad' }>();
  /** Seen unverified on this screen: show a confirmation once it flips, not on every visit. */
  const [wasUnverified, setWasUnverified] = useState(false);
  const verified = Boolean(profile.data?.emailVerifiedAt);

  useEffect(() => {
    if (profile.data && !verified) setWasUnverified(true);
  }, [profile.data, verified]);

  if (!profile.data) return null;

  if (verified) {
    return wasUnverified ? (
      <span
        className="mt-2 flex items-start gap-2 text-emerald-800 dark:text-emerald-300"
        role="status"
      >
        <CircleCheck className="mt-0.5 size-4 flex-none" aria-hidden />
        Your email is verified. Invitations go out as soon as setup finishes.
      </span>
    ) : null;
  }

  return (
    <span className="mt-2 flex flex-col gap-2.5 text-amber-900 dark:text-amber-200" role="status">
      <span className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 flex-none" aria-hidden />
        <span>
          Your email <b>{profile.data.email}</b> isn&apos;t verified yet, so invitations will wait
          until it is. Open the link we emailed you; this updates by itself.
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2 pl-6">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={resend.isPending}
          onClick={() => {
            setMessage(undefined);
            resend.mutate(undefined, {
              onSuccess: (result) => setMessage({ text: result.message, tone: 'ok' }),
              onError: (error) =>
                setMessage({
                  text: getApiErrorMessage(error, "We couldn't send the email. Try again."),
                  tone: 'bad',
                }),
            });
          }}
        >
          {resend.isPending ? 'Sending…' : 'Resend email'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={profile.isFetching}
          onClick={() => void profile.refetch()}
        >
          <RefreshCw className={profile.isFetching ? 'animate-spin' : undefined} aria-hidden />
          {profile.isFetching ? 'Checking…' : 'Check again'}
        </Button>
        {message && (
          <span
            className={
              message.tone === 'ok'
                ? 'text-[13px] text-muted-foreground'
                : 'text-[13px] text-red-700 dark:text-red-400'
            }
          >
            {message.text}
          </span>
        )}
      </span>
    </span>
  );
}
