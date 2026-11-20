'use client';

import { verifyEmailRequestSchema } from '@rms/api-contract';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isRejectedLinkError } from '@/lib/api-error';
import { useVerifyEmail } from '@/services/api/requests/auth';

export default function VerifyEmail() {
  const params = useSearchParams();
  const router = useRouter();
  const token = useState(() => params.get('token'))[0];
  // Email clients sometimes truncate links; reject a malformed token without calling the API.
  const isWellFormed = token !== null && verifyEmailRequestSchema.safeParse({ token }).success;
  const verify = useVerifyEmail();
  const started = useRef(false);

  const linkRejected = !isWellFormed || (verify.isError && isRejectedLinkError(verify.error));
  const transientFailure = verify.isError && !linkRejected;

  useEffect(() => {
    if (!isWellFormed || !token || started.current) return;
    started.current = true;
    verify.mutate({ token });
  }, [isWellFormed, token, verify]);

  // Keep the token in the URL until it is spent or rejected, so a refresh can retry after an outage.
  useEffect(() => {
    if (verify.isSuccess || linkRejected) router.replace('/auth/verify-email');
  }, [linkRejected, router, verify.isSuccess]);

  const title = verify.isSuccess
    ? 'Email verified'
    : linkRejected
      ? 'Link unavailable'
      : transientFailure
        ? "Couldn't verify right now"
        : 'Verifying email…';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {verify.isSuccess
            ? verify.data.message
            : linkRejected
              ? 'This verification link is invalid, expired, or has already been used.'
              : transientFailure
                ? "We couldn't reach the server. Your link is still valid; try again in a moment."
                : 'Please wait while we verify your address.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {transientFailure && token && (
          <Button
            type="button"
            className="w-full"
            disabled={verify.isPending}
            onClick={() => verify.mutate({ token })}
          >
            {verify.isPending ? 'Retrying…' : 'Try again'}
          </Button>
        )}
        <Link
          href={verify.isSuccess ? '/dashboard' : '/auth/login'}
          className={buttonVariants({
            variant: transientFailure ? 'outline' : 'default',
            className: 'w-full',
          })}
        >
          {verify.isSuccess ? 'Continue to dashboard' : 'Go to login'}
        </Link>
      </CardContent>
    </Card>
  );
}
