'use client';

import {
  okResponseSchema,
  QR_FEEDBACK_COMMENT_MAX,
  type QrFeedbackRequest,
  qrFeedbackRequestSchema,
} from '@rms/api-contract';
import { useMutation } from '@tanstack/react-query';
import { MessageSquare, Star } from 'lucide-react';
import { type FormEvent, type ReactElement, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { guestApi, guestErrorMessage } from './api';

const RATINGS = [1, 2, 3, 4, 5] as const;

export default function GuestFeedback({ token }: { token: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const submissionId = useRef<string | null>(null);
  const inputId = useId();
  const submission = useMutation({
    mutationFn: async (data: QrFeedbackRequest) =>
      okResponseSchema.parse((await guestApi.post('/qr/' + token + '/feedback', data)).data),
  });

  async function send(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submission.isPending || sent) return;
    submissionId.current ??= crypto.randomUUID();
    const data = qrFeedbackRequestSchema.safeParse({
      rating,
      comment,
      submissionId: submissionId.current,
    });
    if (!data.success) {
      setError(rating ? 'Keep your comment to 500 characters.' : 'Choose a rating to continue.');
      return;
    }
    setError('');
    try {
      await submission.mutateAsync(data.data);
      setSent(true);
    } catch (cause) {
      setError(guestErrorMessage(cause));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submission.isPending) setOpen(next);
      }}
    >
      <DialogTrigger className="gb o">
        <MessageSquare size={18} aria-hidden /> {sent ? 'Feedback sent' : 'Leave feedback'}
      </DialogTrigger>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        showCloseButton={!submission.isPending}
      >
        <DialogHeader>
          <DialogTitle>{sent ? 'Thank you for your feedback' : 'How was your visit?'}</DialogTitle>
          <DialogDescription>
            {sent
              ? 'Your feedback was sent to the restaurant.'
              : 'Share a rating and an optional comment anonymously with the restaurant.'}
          </DialogDescription>
        </DialogHeader>
        {sent ? (
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        ) : (
          <form className="grid gap-4" onSubmit={(event) => void send(event)} noValidate>
            <fieldset className="space-y-2" disabled={submission.isPending}>
              <legend className="font-medium">Rating</legend>
              <div className="flex gap-1.5">
                {RATINGS.map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={inputId + '-rating'}
                      value={value}
                      checked={rating === value}
                      onChange={() => setRating(value)}
                      className="peer sr-only"
                    />
                    <span className="sr-only">
                      {value} {value === 1 ? 'star' : 'stars'}
                    </span>
                    <span className="grid size-10 cursor-pointer place-items-center rounded-md border peer-checked:border-ring peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                      <Star
                        className={
                          value <= rating
                            ? 'size-5 fill-amber-400 text-amber-600'
                            : 'size-5 text-muted-foreground'
                        }
                        aria-hidden
                      />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="grid gap-2 font-medium">
              Comment (optional)
              <textarea
                className="min-h-24 w-full rounded-md border bg-background p-2 font-normal focus-visible:ring-2 focus-visible:ring-ring"
                value={comment}
                maxLength={QR_FEEDBACK_COMMENT_MAX}
                disabled={submission.isPending}
                onChange={(event) => setComment(event.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={submission.isPending}>
                {submission.isPending ? 'Sending…' : 'Send feedback'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
