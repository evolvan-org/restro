'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useVerifyEmail } from '@/services/api/requests/auth';

export default function VerifyEmail() {
  const params = useSearchParams();
  const router = useRouter();
  const token = useState(() => params.get('token'))[0];
  const verify = useVerifyEmail();
  const started = useRef(false);

  useEffect(() => {
    router.replace('/auth/verify-email');
    if (!token || started.current) return;
    started.current = true;
    verify.mutate({ token });
  }, [router, token, verify]);

  const title = verify.isSuccess
    ? 'Email verified'
    : verify.isError || !token
      ? 'Link unavailable'
      : 'Verifying email…';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {verify.isSuccess
            ? verify.data.message
            : verify.isError || !token
              ? 'This verification link is invalid, expired, or has already been used.'
              : 'Please wait while we verify your address.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href={verify.isSuccess ? '/dashboard' : '/auth/login'}
          className={buttonVariants({ className: 'w-full' })}
        >
          {verify.isSuccess ? 'Continue to dashboard' : 'Go to login'}
        </Link>
      </CardContent>
    </Card>
  );
}
