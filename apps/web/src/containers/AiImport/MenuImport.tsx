'use client';

import {
  effectiveMenuRowPrice,
  includedMenuRows,
  type OnboardingMenuRow,
  type ServingType,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useEffect, useState } from 'react';

import {
  type AiFailureKind,
  AiFailureState,
  FloatingAiProgress,
  PartialReadBanner,
} from '@/components/AiScan/AiStates';
import { mergeScanItems, reviewMenuRows } from '@/components/AiScan/menu/menu-scan-rows';
import { MenuScanReview } from '@/components/AiScan/menu/MenuScanReview';
import { MenuScanStreaming } from '@/components/AiScan/menu/MenuScanStreaming';
import { ScanCapture } from '@/components/AiScan/ScanCapture';
import { Button, buttonVariants } from '@/components/ui/button';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import { isActiveJob, useAiJob } from '@/hooks/useAiJob';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api-error';
import type { ScanPage } from '@/lib/scan-images';
import {
  cancelAiJob,
  createScan,
  releaseAiJob,
  useBulkImportMenu,
} from '@/services/api/requests/ai';
import { useMenuItemSearch } from '@/services/api/requests/menu-items';

const JOB_KEY = 'rms.menu-import.job';

function rememberedJob(): string | undefined {
  try {
    return window.sessionStorage.getItem(JOB_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function remember(jobId: string | undefined): void {
  try {
    if (jobId) window.sessionStorage.setItem(JOB_KEY, jobId);
    else window.sessionStorage.removeItem(JOB_KEY);
  } catch {
    // Without session storage a refresh starts a new scan.
  }
}

/**
 * Menu → Import from photo (after setup): the same capture, streaming and review screens as
 * onboarding; adds the reviewed items to the live menu and flags names it already has.
 */
export default function MenuImport(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.MENU_SCAN]);
  const [jobId, setJobId] = useState<string | undefined>();
  const [rows, setRows] = useState<OnboardingMenuRow[]>([]);
  const [failure, setFailure] = useState<AiFailureKind | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [uploadError, setUploadError] = useState<string>();
  const [reviewEarly, setReviewEarly] = useState(false);
  const { job, items, refetch } = useAiJob(jobId);
  const importMenu = useBulkImportMenu();
  const live = useMenuItemSearch({ page: 1, pageSize: 100, activeOnly: false }, Boolean(jobId));

  useEffect(() => setJobId(rememberedJob()), []);

  useEffect(() => {
    if (!jobId) return;
    setRows((current) => mergeScanItems(current, items, jobId) ?? current);
  }, [items, jobId]);

  // Flag dishes the live menu already has (by name, any category).
  const liveNames = new Set((live.data?.data ?? []).map((item) => item.name.trim().toLowerCase()));
  useEffect(() => {
    if (!liveNames.size) return;
    setRows((current) => {
      let changed = false;
      const next = current.map((row) => {
        if (
          !row.ai ||
          row.ai.flag !== 'dish' ||
          row.ai.reviewed ||
          !liveNames.has(row.name.trim().toLowerCase())
        )
          return row;
        changed = true;
        return {
          ...row,
          excluded: true,
          ai: { ...row.ai, flag: 'duplicate' as const, flagNote: 'Already on your menu.' },
        };
      });
      return changed ? next : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveNames.size, rows.length]);

  if (!allowed) return null;

  async function start(pages: Parameters<typeof createScan>[1]): Promise<void> {
    setUploading(true);
    setUploadError(undefined);
    try {
      const result = await createScan('menu', pages, 'POST_ONBOARDING');
      setRows([]);
      setJobId(result.job.id);
      remember(result.job.id);
    } catch (error) {
      const code = getApiErrorCode(error);
      if (code === 'AI_QUOTA_EXCEEDED') setFailure('QUOTA');
      else if (code === 'AI_UNAVAILABLE') setFailure('AI_UNAVAILABLE');
      else setUploadError(getApiErrorMessage(error, 'The upload failed. Try again.'));
    } finally {
      setUploading(false);
    }
  }

  function reset(): void {
    if (jobId) void releaseAiJob(jobId);
    remember(undefined);
    setJobId(undefined);
    setRows([]);
    setReviewEarly(false);
    importMenu.reset();
  }

  const review = reviewMenuRows(rows);
  const toImport = includedMenuRows(rows).filter((row) => review.groups.get(row.key) === 'ready');

  async function onImport(): Promise<void> {
    await importMenu.mutateAsync({
      ...(jobId && { scanJobId: jobId }),
      rows: toImport.map((row) => ({
        category: row.category.trim() || 'Menu',
        itemType: (row.type.trim().toUpperCase() === 'BAR' ? 'BAR' : 'FOOD') as ServingType,
        name: row.name.trim(),
        price: effectiveMenuRowPrice(row).trim() || '0',
        dietType: row.dietType ?? null,
        ...(row.variants?.length && {
          variants: row.variants.map((variant) => ({
            name: variant.name.trim(),
            price: variant.price.trim(),
          })),
        }),
      })),
    });
    remember(undefined);
  }

  const done = importMenu.data;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/menu/items"
          className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Menu items
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Import menu from photo</h1>
        <p className="text-sm text-muted-foreground">
          We read the menu and draft the items. You review them; nothing is added until you import.
        </p>
      </div>

      {done ? (
        <section
          className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5"
          role="status"
        >
          <h2 className="flex items-center gap-2 text-lg font-semibold text-emerald-950">
            <CircleCheck className="size-5" aria-hidden />
            {done.created} {done.created === 1 ? 'item' : 'items'} added
            {done.categoriesCreated ? ` in ${done.categoriesCreated} new categories` : ''}
          </h2>
          {done.skippedDuplicates.length > 0 && (
            <p className="text-sm text-emerald-950">
              Left out because they are already on the menu:{' '}
              {done.skippedDuplicates.map((row) => row.name).join(', ')}.
            </p>
          )}
          <p className="text-sm text-emerald-950">
            Next: open each item to add its recipe, or draft them on the Margins page.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/menu/items" className={buttonVariants()}>
              Go to menu
            </Link>
            <Button variant="outline" onClick={reset}>
              Import another menu
            </Button>
          </div>
        </section>
      ) : failure ? (
        <AiFailureState
          kind={failure}
          noun="menu"
          actions={
            <Button className="h-11" onClick={() => setFailure(null)}>
              Back
            </Button>
          }
        />
      ) : !jobId ? (
        <ScanCapture
          noun="menu"
          pages={pages}
          onPagesChange={setPages}
          error={uploadError}
          inlineStart={{
            label: `Read ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`,
            busy: uploading,
            onStart: () => void start(pages),
          }}
        />
      ) : !job ? (
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" aria-busy="true" />
      ) : isActiveJob(job) && !reviewEarly ? (
        <MenuScanStreaming
          job={job}
          items={items}
          stopping={false}
          onReviewEarly={() => setReviewEarly(true)}
          onStop={() => void cancelAiJob(job.id).then(refetch)}
        />
      ) : job.status === 'FAILED' && rows.length === 0 ? (
        <AiFailureState
          kind={job.errorCode ?? 'UNREADABLE'}
          noun="menu"
          actions={
            <Button className="h-11" onClick={reset}>
              Retake photos
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {isActiveJob(job) && (
            <FloatingAiProgress label={`Reading menu · ${items.length} items`} />
          )}
          {!isActiveJob(job) && <PartialReadBanner job={job} onRetake={reset} />}
          <MenuScanReview
            rows={rows}
            onChange={setRows}
            jobId={job.id}
            imagesAvailable={job.imagesAvailable}
            review={review}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" className="h-11" onClick={reset}>
              Discard scan
            </Button>
            <Button
              className="h-11 px-5"
              disabled={toImport.length === 0 || importMenu.isPending || isActiveJob(job)}
              onClick={() => void onImport()}
            >
              Import {toImport.length}, leave out {rows.length - toImport.length}
            </Button>
          </div>
          {importMenu.isError && (
            <p role="alert" className="text-right text-sm text-red-700">
              {getApiErrorMessage(
                importMenu.error,
                "The import didn't go through. Nothing was added; try again.",
              )}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
