'use client';

import { MailWarning } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useResendVerification } from '@/services/api/requests/auth';
import { useProfile } from '@/services/api/requests/profile';

export default function EmailVerificationBanner() {
  const profile = useProfile();
  const resend = useResendVerification();
  const [message, setMessage] = useState<string>();

  if (!profile.data || profile.data.emailVerifiedAt) return null;

  return (
    <aside className="flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-6">
      <MailWarning className="size-4" aria-hidden />
      <p className="flex-1">
        Verify your email to invite staff.{' '}
        {message ?? 'Check your inbox for the verification link.'}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={resend.isPending}
        onClick={() =>
          resend.mutate(undefined, { onSuccess: (result) => setMessage(result.message) })
        }
      >
        {resend.isPending ? 'Sending…' : 'Resend email'}
      </Button>
    </aside>
  );
}
