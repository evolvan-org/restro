'use client';

import type { OnboardingMenuDraft, OnboardingMenuRow } from '@rms/api-contract';
import { ArrowRight, Camera, RotateCcw, Sparkles } from 'lucide-react';
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';

import {
  type AiFailureKind,
  AiFailureState,
  FloatingAiProgress,
  PartialReadBanner,
} from '@/components/AiScan/AiStates';
import { AiSuggestedChip } from '@/components/AiScan/markers';
import { mergeScanItems, reviewMenuRows } from '@/components/AiScan/menu/menu-scan-rows';
import { MenuScanReview } from '@/components/AiScan/menu/MenuScanReview';
import { MenuScanStreaming } from '@/components/AiScan/menu/MenuScanStreaming';
import { hasBlockedPages, ScanCapture } from '@/components/AiScan/ScanCapture';
import { isActiveJob, useAiJob } from '@/hooks/useAiJob';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api-error';
import { pageBlockReason, prepareScanPages, releasePages, type ScanPage } from '@/lib/scan-images';
import { cancelAiJob, createScan, releaseAiJob, retakeScanPage } from '@/services/api/requests/ai';

import Shell from '../../Shell';
import { Alert, btn, Chip } from '../../ui/kit';

type Nav = {
  back: () => void;
  skip: () => Promise<void>;
  next: () => Promise<void>;
  busy: boolean;
};

/**
 * Menu → Scan menu photo (boards "Menu scan: capture / live extraction / review / failure states").
 * Rows land in the menu draft as they stream, so a refresh or a closed tab resumes where it was.
 */
export function MenuScanStep({
  menu,
  save,
  nav,
  modeSwitch,
  onSwitchMode,
}: {
  menu: OnboardingMenuDraft;
  save: (patch: Partial<OnboardingMenuDraft>) => void;
  nav: Nav;
  /** The Scan / CSV / manual / later control (shown while capturing). */
  modeSwitch: ReactNode;
  onSwitchMode: (mode: OnboardingMenuDraft['mode']) => void;
}): ReactElement {
  const { job, items, refetch } = useAiJob(menu.scanJobId);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [failure, setFailure] = useState<AiFailureKind | null>(null);
  const [reviewEarly, setReviewEarly] = useState(false);
  const [stopping, setStopping] = useState(false);
  const retakeInput = useRef<HTMLInputElement>(null);
  const retakePage = useRef<number | null>(null);

  const latest = useRef({ menu, save });
  latest.current = { menu, save };
  useEffect(() => {
    const { menu: current, save: persist } = latest.current;
    if (!current.scanJobId) return;
    const merged = mergeScanItems(current.rows, items, current.scanJobId);
    if (merged) persist({ rows: merged });
  }, [items]);

  async function start(): Promise<void> {
    setUploading(true);
    setUploadError(undefined);
    setFailure(null);
    try {
      if (!navigator.onLine) {
        setFailure('OFFLINE');
        return;
      }
      const result = await createScan('menu', pages, 'ONBOARDING');
      save({ mode: 'scan', scanJobId: result.job.id, rows: menu.rows.filter((row) => !row.ai) });
      setReviewEarly(false);
    } catch (error) {
      const code = getApiErrorCode(error);
      if (code === 'AI_QUOTA_EXCEEDED') setFailure('QUOTA');
      else if (code === 'AI_UNAVAILABLE') setFailure('AI_UNAVAILABLE');
      else
        setUploadError(
          getApiErrorMessage(error, 'The upload failed. Your photos are still here; try again.'),
        );
    } finally {
      setUploading(false);
    }
  }

  async function stop(): Promise<void> {
    if (!menu.scanJobId) return;
    setStopping(true);
    try {
      await cancelAiJob(menu.scanJobId);
      refetch();
      setReviewEarly(true);
    } finally {
      setStopping(false);
    }
  }

  function startOver(): void {
    if (menu.scanJobId) void releaseAiJob(menu.scanJobId);
    save({ scanJobId: undefined, rows: menu.rows.filter((row) => !row.ai) });
    setFailure(null);
    setReviewEarly(false);
  }

  async function onRetakeFile(file: File | undefined): Promise<void> {
    const page = retakePage.current;
    if (!file || !page || !menu.scanJobId) return;
    try {
      const [photo] = await prepareScanPages([file], 1);
      if (!photo) return;
      // Same gate as a new scan: an unreadable retake isn't sent.
      const blocked = pageBlockReason(photo);
      if (blocked) {
        releasePages([photo]);
        setUploadError(`Page ${page}: ${blocked}`);
        return;
      }
      const pageSeqs = new Set(items.filter((item) => item.page === page).map((item) => item.seq));
      save({
        rows: menu.rows.filter(
          (row) => !(row.ai && row.ai.jobId === menu.scanJobId && pageSeqs.has(row.ai.seq)),
        ),
      });
      await retakeScanPage('menu', menu.scanJobId, page, photo);
      setReviewEarly(false);
      refetch();
    } catch (error) {
      setUploadError(getApiErrorMessage(error, "We couldn't retake that page. Try again."));
    }
  }

  const captureSub =
    'Photograph your paper menu. We fill in categories, items, prices and veg or non-veg.';
  const switchButtons = (
    <>
      <button type="button" className={btn('default', 'sm')} onClick={() => onSwitchMode('csv')}>
        Import CSV
      </button>
      <button type="button" className={btn('default', 'sm')} onClick={() => onSwitchMode('manual')}>
        Add manually
      </button>
    </>
  );

  if (failure) {
    return (
      <Shell
        step="menu"
        title="Menu"
        description={captureSub}
        width="wide"
        footer={{ onBack: nav.back, onSkip: () => void nav.skip() }}
      >
        <div className="self-start">{modeSwitch}</div>
        <AiFailureState
          kind={failure}
          noun="menu"
          actions={
            <>
              {failure !== 'QUOTA' && (
                <button
                  type="button"
                  className={btn('primary', 'sm')}
                  onClick={() => setFailure(null)}
                >
                  Try again
                </button>
              )}
              {switchButtons}
            </>
          }
        />
      </Shell>
    );
  }

  if (!menu.scanJobId) {
    return (
      <Shell
        step="menu"
        title="Menu"
        description={captureSub}
        width="wide"
        footer={{
          onBack: nav.back,
          onSkip: () => void nav.skip(),
          note: 'Photos are only used to read your menu.',
          primary: (
            <button
              type="button"
              className={btn('ai')}
              disabled={pages.length === 0 || uploading || hasBlockedPages(pages)}
              onClick={() => void start()}
            >
              <Sparkles aria-hidden />
              {uploading
                ? 'Uploading…'
                : pages.length
                  ? `Read ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`
                  : 'Read pages'}
            </button>
          ),
        }}
      >
        <div className="self-start">{modeSwitch}</div>
        <ScanCapture noun="menu" pages={pages} onPagesChange={setPages} error={uploadError} />
      </Shell>
    );
  }

  if (!job) {
    return (
      <Shell
        step="menu"
        title="Menu"
        description="Loading your scan…"
        width="wide"
        footer={{ onBack: nav.back }}
      >
        <div
          className="h-60 animate-pulse rounded-[10px] bg-muted"
          aria-busy="true"
          aria-label="Loading scan"
        />
      </Shell>
    );
  }

  const active = isActiveJob(job);
  const scanRows = menu.rows.filter((row) => row.ai?.jobId === job.id);
  const otherRows = menu.rows.filter((row) => row.ai?.jobId !== job.id);
  const dishes = items.length;

  if (active && !reviewEarly) {
    return (
      <Shell
        step="menu"
        title="Menu"
        description="Reading your menu…"
        width="wide"
        floating={<FloatingAiProgress label={`Reading menu · ${dishes} items`} />}
        footer={{
          note: 'Nothing is saved to your restaurant yet.',
          primary: (
            <button type="button" className={btn('primary')} disabled>
              Save and continue
              <ArrowRight aria-hidden />
            </button>
          ),
        }}
      >
        <MenuScanStreaming
          job={job}
          items={items}
          onReviewEarly={() => setReviewEarly(true)}
          onStop={() => void stop()}
          stopping={stopping}
        />
      </Shell>
    );
  }

  if (job.status === 'FAILED' && scanRows.length === 0) {
    return (
      <Shell
        step="menu"
        title="Menu"
        description={captureSub}
        width="wide"
        footer={{ onBack: nav.back, onSkip: () => void nav.skip() }}
      >
        <div className="self-start">{modeSwitch}</div>
        <AiFailureState
          kind={job.errorCode ?? 'UNREADABLE'}
          noun="menu"
          actions={
            <>
              <button type="button" className={btn('primary', 'sm')} onClick={startOver}>
                <Camera aria-hidden />
                {job.errorCode === 'AI_UNAVAILABLE' ? 'Try again' : 'Retake photo'}
              </button>
              {switchButtons}
            </>
          }
        />
      </Shell>
    );
  }

  const review = reviewMenuRows(scanRows);
  const leaveOut = review.attention + review.out;
  return (
    <Shell
      step="menu"
      title="Review your menu"
      description="Problems first. Fix them, or leave them out. Nothing goes live until you finish."
      headerRight={
        <>
          <AiSuggestedChip />
          <Chip>
            {scanRows.length} rows read from {job.pagesTotal}{' '}
            {job.pagesTotal === 1 ? 'page' : 'pages'}
          </Chip>
        </>
      }
      width="wide"
      floating={
        active ? <FloatingAiProgress label={`Reading menu · ${dishes} items`} /> : undefined
      }
      footer={{
        onBack: nav.back,
        note: active ? 'Still reading; new rows join the list.' : undefined,
        primary: (
          <button
            type="button"
            className={btn('primary')}
            disabled={review.ready === 0 || nav.busy || active}
            onClick={() => {
              if (review.attention > 0) {
                save({
                  rows: menu.rows.map((row) =>
                    review.groups.get(row.key) === 'attention' ? { ...row, excluded: true } : row,
                  ),
                });
              }
              void nav.next();
            }}
          >
            Import {review.ready}
            {leaveOut ? `, leave out ${leaveOut}` : ''}
            <ArrowRight aria-hidden />
          </button>
        ),
      }}
    >
      <input
        ref={retakeInput}
        type="file"
        accept="image/*,application/pdf,.heic,.heif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          void onRetakeFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {!active && (
        <PartialReadBanner
          job={job}
          onRetake={(page) => {
            retakePage.current = page;
            retakeInput.current?.click();
          }}
        />
      )}
      {job.status === 'PARTIAL' && job.errorCode === 'AI_UNAVAILABLE' && (
        <AiFailureState kind="AI_UNAVAILABLE" noun="menu" actions={switchButtons} />
      )}
      <MenuScanReview
        rows={scanRows}
        onChange={(next: OnboardingMenuRow[]) => save({ rows: [...otherRows, ...next] })}
        jobId={job.id}
        imagesAvailable={job.imagesAvailable}
        review={review}
      />
      <Alert tone="ai" icon={<Sparkles aria-hidden />} className="items-center">
        <span className="text-sm">
          <b>Next, we&apos;ll draft a recipe for each of these dishes.</b> You check the
          ingredients; stock is then deducted as orders are made.
        </span>
      </Alert>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        {job.droppedRows > 0 && <span>{job.droppedRows} unreadable lines were skipped.</span>}
        <span>Wrong photos?</span>
        <button type="button" className={btn('ghost', 'sm')} onClick={startOver}>
          <RotateCcw aria-hidden />
          Start a new scan
        </button>
      </div>
    </Shell>
  );
}
