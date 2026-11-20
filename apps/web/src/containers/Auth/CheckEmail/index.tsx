'use client';

import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useResendVerification } from '@/services/api/requests/auth';

export default function CheckEmail() {
  const resend = useResendVerification();
  const [message, setMessage] = useState<string>();

  return (
    <Card>
      <CardHeader className="text-center">
        <MailCheck className="mx-auto size-10" aria-hidden />
        <CardTitle>Check your inbox</CardTitle>
        <CardDescription>
          We sent a verification link to your email address. The link expires after 24 hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && <p className="text-center text-sm text-muted-foreground">{message}</p>}
        {resend.isError && (
          <p role="alert" className="text-center text-sm text-destructive">
            Unable to resend right now. Please wait and try again.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={resend.isPending}
          onClick={() =>
            resend.mutate(undefined, { onSuccess: (result) => setMessage(result.message) })
          }
        >
          {resend.isPending ? 'Sending…' : 'Resend verification email'}
        </Button>
        <Link href="/dashboard" className={buttonVariants({ className: 'w-full' })}>
          Continue to dashboard
        </Link>
      </CardContent>
    </Card>
  );
}
