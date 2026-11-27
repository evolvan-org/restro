'use client';

import { type AiJob, type AiJobItem, menuScanRowSchema } from '@rms/api-contract';
import { cn } from 'cn';
import { Sparkles } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useRef } from 'react';

import {
  Alert,
  btn,
  Card,
  CheckSquare,
  Chip,
  GridHead,
  GridRow,
  GridTable,
  ProgressBar,
} from '@/containers/Onboarding/ui/kit';

import { ConfidenceBadge, DietMarker } from '../markers';
import { ScanPhoto, useScanPageUrl } from '../ScanPhoto';

export const MENU_COLS = '22px 128px 118px 86px 124px minmax(200px,1fr) 128px';

export function MenuTableHead(): ReactElement {
  return (
    <GridHead cols={MENU_COLS}>
      <span />
      <span>Confidence</span>
      <span>Category</span>
      <span>Type</span>
      <span>Veg</span>
      <span>Name</span>
      <span className="text-right">Price</span>
    </GridHead>
  );
}

function PageThumb({ job, page, on }: { job: AiJob; page: number; on: boolean }): ReactElement {
  const url = useScanPageUrl(job.id, page, job.imagesAvailable);
  return (
    <span
      className={cn(
        'relative block h-[84px] w-16 flex-none overflow-hidden rounded-md border border-zinc-300 bg-[#f4ecd8] dark:border-zinc-700',
        on && 'outline-2 outline-offset-2 outline-foreground',
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" className="size-full object-cover" />}
      <b className="absolute bottom-1 left-1 rounded bg-black/70 px-[5px] text-[11px] text-white">
        {page}
      </b>
    </span>
  );
}

/**
 * Live extraction (board "Menu scan: live extraction"): no spinner. The photo beside the table;
 * rows stream in one by one and the matching region of the photo glows as each appears.
 */
export function MenuScanStreaming({
  job,
  items,
  onReviewEarly,
  onStop,
  stopping,
}: {
  job: AiJob;
  items: readonly AiJobItem[];
  onReviewEarly: () => void;
  onStop: () => void;
  stopping: boolean;
}): ReactElement {
  const rows = useMemo(
    () =>
      items.flatMap((item) => {
        const row = menuScanRowSchema.safeParse(item.data);
        return row.success ? [{ seq: item.seq, page: item.page ?? 1, row: row.data }] : [];
      }),
    [items],
  );
  const latest = rows[rows.length - 1];
  const reading = job.pages.find((page) => page.status === 'reading');
  const page = reading?.page ?? latest?.page ?? 1;
  const photo = useScanPageUrl(job.id, page, job.imagesAvailable);
  const found = rows.filter((entry) => entry.row.flag === 'dish').length;
  const title = job.pages.find((entry) => entry.page === page)?.title;
  const elapsed = (Date.now() - Date.parse(job.createdAt)) / 1000;
  const perPage = job.pagesDone > 0 ? elapsed / job.pagesDone : 15;
  const left = Math.max(1, Math.round(perPage * (job.pagesTotal - job.pagesDone)));
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [rows.length]);

  return (
    <div className="flex flex-col items-start gap-5 lg:flex-row">
      <Card className="flex w-full flex-none flex-col gap-3 bg-muted p-4 lg:w-[430px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">
            Page {page}
            {title ? ` · ${title}` : ''}
          </span>
          <Chip tone="ai">
            <Sparkles aria-hidden />
            Reading
          </Chip>
        </div>
        <div className="flex justify-center px-2 pt-4 pb-2.5">
          <div className="w-full max-w-[380px] -rotate-[1.2deg]">
            <ScanPhoto
              url={photo}
              highlight={latest?.page === page ? latest.row.source : null}
              label={latest ? `Row ${rows.length} · ${latest.row.name}` : undefined}
              alt={`Menu page ${page}`}
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {job.pages.map((entry) => (
            <PageThumb key={entry.page} job={job} page={entry.page} on={entry.page === page} />
          ))}
        </div>
      </Card>

      <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
        <Card className="px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-sm font-semibold" aria-live="polite">
                Page {Math.min(job.pagesDone + 1, job.pagesTotal)} of {job.pagesTotal} · {found}{' '}
                items found
              </span>
              <span className="text-[13px] text-muted-foreground">About {left} seconds left</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btn('ghost', 'sm')}
                onClick={onStop}
                disabled={stopping}
              >
                {stopping ? 'Stopping…' : 'Stop reading'}
              </button>
              <button type="button" className={btn('default', 'sm')} onClick={onReviewEarly}>
                Review what&apos;s found so far
              </button>
            </div>
          </div>
          <ProgressBar
            className="mt-2.5"
            tone="ai"
            label="Pages read"
            value={
              job.pagesTotal
                ? (job.pagesDone / job.pagesTotal) * 100 + (reading ? 50 / job.pagesTotal : 0)
                : 0
            }
          />
        </Card>
        <Alert tone="ai" icon={<Sparkles aria-hidden />}>
          <span className="text-[13px]">
            <b>Rows appear as they&apos;re found.</b> Each one lights up its place on the menu.
          </span>
        </Alert>
        <div ref={listRef} className="max-h-[520px] overflow-y-auto rounded-[10px]">
          <GridTable label="Rows read so far">
            <MenuTableHead />
            {rows.map(({ seq, row }, index) => {
              const newest = index === rows.length - 1;
              return (
                <GridRow
                  key={seq}
                  cols={MENU_COLS}
                  tone={newest ? 'new' : row.flag !== 'dish' ? 'out' : 'default'}
                  className="motion-safe:animate-[stream-in_.3s_ease-out]"
                >
                  <CheckSquare on={row.flag === 'dish'} />
                  <div>
                    <ConfidenceBadge value={row.confidence} />
                  </div>
                  <div className="truncate border-b border-dotted border-zinc-300 py-1 text-sm">
                    {row.category || '—'}
                  </div>
                  <div>
                    <Chip>{row.type}</Chip>
                  </div>
                  <div>
                    <DietMarker diet={row.dietType} />
                  </div>
                  <div className="min-w-0">
                    <div
                      className={cn(
                        'truncate border-b border-dotted border-zinc-300 py-1 text-sm font-medium',
                        row.flag !== 'dish' && 'line-through',
                      )}
                    >
                      {row.name}
                      {newest && (
                        <span
                          className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-indigo-700 align-middle motion-reduce:animate-none"
                          aria-hidden
                        />
                      )}
                    </div>
                    {row.originalName && (
                      <div className="text-xs text-muted-foreground" lang="hi">
                        {row.originalName}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    {row.variants.length
                      ? row.variants
                          .map((variant) => `${variant.name[0]} ₹${variant.price}`)
                          .join(' · ')
                      : row.price
                        ? `₹${row.price}`
                        : '—'}
                  </div>
                </GridRow>
              );
            })}
          </GridTable>
        </div>
        <style>{`@keyframes stream-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }`}</style>
      </div>
    </div>
  );
}
