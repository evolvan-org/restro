'use client';

import { qrFeedbackListResponseSchema } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Star } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import { api } from '@/lib/api';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const ratings = [5, 4, 3, 2, 1] as const;

export default function GuestFeedbackPage(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.QR_SETTINGS_WRITE]);
  const [rating, setRating] = useState('');
  const [page, setPage] = useState(1);
  const feedback = useQuery({
    queryKey: ['qr-feedback', page, rating],
    queryFn: async ({ signal }) =>
      qrFeedbackListResponseSchema.parse(
        (
          await api.get('/qr-orders/feedback', {
            params: { page, rating: rating || undefined },
            signal,
            errorDisplay: 'inline',
          })
        ).data,
      ),
    enabled: Boolean(allowed),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (!allowed) return null;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:py-14">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Guest feedback</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ratings and comments from your table QR menus.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NativeSelect
            aria-label="Filter by rating"
            value={rating}
            onChange={(event) => {
              setRating(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All ratings</option>
            {ratings.map((value) => (
              <option key={value} value={value}>
                {value} {value === 1 ? 'star' : 'stars'}
              </option>
            ))}
          </NativeSelect>
          <Button
            type="button"
            variant="outline"
            disabled={feedback.isFetching}
            onClick={() => void feedback.refetch()}
          >
            <RefreshCw aria-hidden /> Refresh
          </Button>
        </div>
      </div>
      {feedback.isError ? (
        <p role="alert" className="rounded-md border p-6 text-center text-sm text-destructive">
          Unable to load feedback. Select Refresh to try again.
        </p>
      ) : feedback.isPending ? (
        <p
          role="status"
          className="rounded-md border p-6 text-center text-sm text-muted-foreground"
        >
          Loading feedback…
        </p>
      ) : feedback.data.data.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          {rating ? 'No feedback matches this rating.' : 'No feedback yet.'}
        </p>
      ) : (
        <>
          <ul className="divide-y rounded-lg border">
            {feedback.data.data.map((entry) => (
              <li key={entry.id} className="space-y-3 px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-sm font-medium">
                      <Star className="size-4 fill-amber-400 text-amber-600" aria-hidden />{' '}
                      {entry.rating} / 5 <span className="sr-only">stars</span>
                    </span>
                    <span className="text-sm font-medium">
                      {entry.section} · Table {entry.tableNumber}
                    </span>
                  </div>
                  <time className="text-sm text-muted-foreground" dateTime={entry.createdAt}>
                    {dateTime.format(new Date(entry.createdAt))}
                  </time>
                </div>
                {entry.comment && (
                  <p className="whitespace-pre-wrap wrap-anywhere text-sm">{entry.comment}</p>
                )}
              </li>
            ))}
          </ul>
          {feedback.data.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                Page {page} of {feedback.data.meta.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={page >= feedback.data.meta.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
