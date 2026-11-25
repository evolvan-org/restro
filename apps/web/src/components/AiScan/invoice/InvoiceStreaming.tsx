'use client';

import {
  type AiJob,
  type AiJobItem,
  formatInr,
  invoiceScanLineSchema,
  parseDecimal,
} from '@rms/api-contract';
import { Sparkles } from 'lucide-react';
import { type ReactElement, useMemo } from 'react';

import { Button } from '@/components/ui/button';

import { ConfidenceBadge } from '../markers';
import { ScanPhoto, useScanPageUrl } from '../ScanPhoto';

/** Live invoice extraction beside the photo; each line glows on the page as it is read. */
export function InvoiceStreaming({
  job,
  items,
  onStop,
  stopping,
}: {
  job: AiJob;
  items: readonly AiJobItem[];
  onStop: () => void;
  stopping: boolean;
}): ReactElement {
  const lines = useMemo(
    () =>
      items.flatMap((item) => {
        const line = invoiceScanLineSchema.safeParse(item.data);
        return line.success ? [{ seq: item.seq, page: item.page ?? 1, line: line.data }] : [];
      }),
    [items],
  );
  const latest = lines[lines.length - 1];
  const page = latest?.page ?? job.pages.find((entry) => entry.status === 'reading')?.page ?? 1;
  const photo = useScanPageUrl(job.id, page, job.imagesAvailable);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
      <ScanPhoto
        url={photo}
        highlight={latest?.line.source}
        label={latest?.line.description}
        alt={`Invoice page ${page}`}
      />
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white p-4">
          <p className="flex items-center gap-2 text-sm font-semibold" aria-live="polite">
            <Sparkles className="size-4 text-indigo-700" aria-hidden />
            Reading invoice · page {Math.min(job.pagesDone + 1, job.pagesTotal)} of {job.pagesTotal}{' '}
            · {lines.length} lines
          </p>
          <Button variant="outline" className="h-11" onClick={onStop} disabled={stopping}>
            {stopping ? 'Stopping…' : 'Stop reading'}
          </Button>
        </div>
        <ol className="flex max-h-[480px] flex-col divide-y divide-neutral-100 overflow-y-auto rounded-xl border border-neutral-200 bg-white">
          {lines.map(({ seq, line }) => (
            <li
              key={seq}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 text-sm"
            >
              <ConfidenceBadge value={line.confidence} />
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs">{line.rawText}</span>
                <span className="text-xs text-neutral-600">{line.description}</span>
              </span>
              <span className="tabular-nums">{formatInr(parseDecimal(line.amount) ?? 0, 2)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
