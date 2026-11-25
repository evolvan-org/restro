'use client';

import {
  type CostBand,
  costBand,
  type DietType,
  invoiceScanLineSchema,
  marginDiff,
  type OnboardingDraftData,
  type OnboardingInventoryDraft,
  type OnboardingInventoryRow,
  type OnboardingInvoiceDraft,
  parseDecimal,
} from '@rms/api-contract';
import { BarChart3, Plus, Receipt, Sparkles } from 'lucide-react';
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';

import {
  type AiFailureKind,
  AiFailureState,
  FloatingAiProgress,
  PartialReadBanner,
} from '@/components/AiScan/AiStates';
import {
  applicableLines,
  checkInvoiceTotal,
  invoiceFromScan,
  type MatchCandidate,
} from '@/components/AiScan/invoice/invoice-lines';
import {
  InvoiceHeaderCard,
  InvoiceLinesTable,
  InvoiceTotalAlert,
  type MarginChangeRow,
  MarginDiffList,
} from '@/components/AiScan/invoice/InvoiceReview';
import { ConfidenceBadge, PriceSourceChip } from '@/components/AiScan/markers';
import { ScanCapture } from '@/components/AiScan/ScanCapture';
import { ScanPhoto, useScanPageUrl } from '@/components/AiScan/ScanPhoto';
import { isActiveJob, useAiJob } from '@/hooks/useAiJob';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api-error';
import { prepareScanPages, type ScanPage } from '@/lib/scan-images';
import { cancelAiJob, createScan, releaseAiJob, retakeScanPage } from '@/services/api/requests/ai';

import { ingredientKey, marginSnapshot, recipeTarget } from '../../costing';
import { newKey } from '../../keys';
import { Alert, btn, Card, Chip, GridHead, GridRow, GridTable } from '../../ui/kit';

const round3 = (value: number): string => String(Math.round(value * 1000) / 1000);

/** Applies an invoice to the inventory rows: opening quantity and real unit cost per ingredient. */
export function applyInvoice(
  rows: readonly OnboardingInventoryRow[],
  invoice: OnboardingInvoiceDraft,
): { rows: OnboardingInventoryRow[]; updated: number; skipped: number } {
  let next = [...rows];
  let updated = 0;
  let skipped = 0;
  for (const line of applicableLines(invoice)) {
    const quantity = parseDecimal(line.baseQuantity) ?? 0;
    const cost = line.unitCost;
    const unit = line.baseUnit.toUpperCase();
    if (line.ingredientKey) {
      const index = next.findIndex((row) => row.key === line.ingredientKey);
      const row = next[index];
      if (!row) continue;
      if (row.baseUnit.toUpperCase() !== unit) {
        skipped += 1;
        continue;
      }
      next[index] = {
        ...row,
        openingQuantity: round3((parseDecimal(row.openingQuantity) ?? 0) + quantity),
        openingUnitCost: cost,
        costSource: 'invoice',
      };
      updated += 1;
    } else if (line.newIngredientName?.trim()) {
      const name = line.newIngredientName.trim();
      const existing = next.findIndex((row) => ingredientKey(row.name) === ingredientKey(name));
      if (existing >= 0) {
        next = next.map((row, index) =>
          index === existing && row.baseUnit.toUpperCase() === unit
            ? {
                ...row,
                openingQuantity: round3((parseDecimal(row.openingQuantity) ?? 0) + quantity),
                openingUnitCost: cost,
                costSource: 'invoice',
              }
            : row,
        );
      } else {
        next.push({
          key: newKey(),
          name,
          sku: '',
          baseUnit: unit,
          reorderLevel: '0',
          openingQuantity: round3(quantity),
          openingUnitCost: cost,
          origin: 'invoice',
          costSource: 'invoice',
        });
      }
      updated += 1;
    }
  }
  return { rows: next, updated, skipped };
}

const READ_COLS = 'minmax(200px,1fr) 120px 110px';

function InvoicePhotoCard({
  jobId,
  page,
  pages,
  available,
  reading,
  highlight,
  label,
  onAddAnother,
}: {
  jobId: string;
  page: number;
  pages: number;
  available: boolean;
  reading: boolean;
  highlight?: import('@rms/api-contract').SourceBox | null;
  label?: string;
  onAddAnother?: () => void;
}): ReactElement {
  const url = useScanPageUrl(jobId, page, available);
  return (
    <Card className="flex w-full flex-none flex-col gap-3 bg-muted p-4 lg:w-[400px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          Invoice · page {page} of {pages}
        </span>
        <Chip tone="ai">
          <Sparkles aria-hidden />
          {reading ? 'Reading' : 'Read'}
        </Chip>
      </div>
      <div className="flex justify-center px-2 pt-3.5 pb-1.5">
        <div className="w-full max-w-[360px] rotate-[0.8deg]">
          <ScanPhoto url={url} highlight={highlight} label={label} alt={`Invoice page ${page}`} />
        </div>
      </div>
      <div className="flex items-center">
        <span className="flex-1" />
        <button
          type="button"
          className={btn('default', 'sm')}
          disabled={!onAddAnother}
          onClick={onAddAnother}
        >
          <Plus aria-hidden />
          Add another invoice
        </button>
      </div>
    </Card>
  );
}

export type InvoiceScanView = {
  /** Replaces the inventory body while a scan is in progress, or after costs are applied. */
  content: ReactNode | null;
  primary?: ReactNode;
  note?: string;
  floating?: ReactNode;
  sub?: string;
  /** Rows the last invoice updated (highlighted in the table). */
  highlight: ReadonlySet<string>;
};

/**
 * Inventory → Scan supplier invoice (boards "invoice scan and matching" and "live margin update"):
 * capture, live read beside the photo, line matching with pack conversion and the total check,
 * then apply real costs and show the before → after diff. Several invoices in a row.
 */
export function useInvoiceScan({
  data,
  inventory,
  save,
  menuSkipped,
  table,
  onSwitchMode,
}: {
  data: OnboardingDraftData;
  inventory: OnboardingInventoryDraft;
  save: (patch: Partial<OnboardingInventoryDraft>) => void;
  menuSkipped: boolean;
  /** Renders the ingredient table (given rows to highlight); placed by the phase that shows it. */
  table: (highlight: ReadonlySet<string>, compact?: boolean) => ReactNode;
  onSwitchMode: (mode: NonNullable<OnboardingInventoryDraft['mode']>) => void;
}): InvoiceScanView {
  const invoices = inventory.invoices ?? [];
  const current = invoices.find((invoice) => !invoice.applied);
  const { job, items, refetch } = useAiJob(current?.jobId);
  const [capturing, setCapturing] = useState(false);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [failure, setFailure] = useState<AiFailureKind | null>(null);
  const [diff, setDiff] = useState<{
    key: string;
    updated: number;
    skipped: number;
    undo: Partial<OnboardingInventoryDraft>;
  } | null>(null);
  const retakeInput = useRef<HTMLInputElement>(null);
  const retakePage = useRef<number | null>(null);

  const candidates: MatchCandidate[] = inventory.rows.map((row) => ({
    key: row.key,
    name: row.name,
    baseUnit: row.baseUnit.toUpperCase(),
    aliases: data.recipes?.ingredients.find(
      (entry) => ingredientKey(entry.name) === ingredientKey(row.name),
    )?.aliases,
  }));
  const setInvoice = (invoice: OnboardingInvoiceDraft): void =>
    save({ invoices: invoices.map((entry) => (entry.key === invoice.key ? invoice : entry)) });

  const latest = useRef({ current, setInvoice, candidates });
  latest.current = { current, setInvoice, candidates };
  useEffect(() => {
    const { current: invoice } = latest.current;
    if (!invoice || !job || isActiveJob(job) || invoice.lines.length > 0 || items.length === 0)
      return;
    latest.current.setInvoice(invoiceFromScan(invoice.key, job, items, latest.current.candidates));
  }, [job, items]);

  async function start(): Promise<void> {
    setUploading(true);
    setUploadError(undefined);
    setFailure(null);
    try {
      if (!navigator.onLine) {
        setFailure('OFFLINE');
        return;
      }
      const result = await createScan('invoice', pages, 'ONBOARDING');
      const invoice: OnboardingInvoiceDraft = {
        key: newKey(),
        jobId: result.job.id,
        supplierName: '',
        supplierGstin: '',
        invoiceNumber: '',
        invoiceDate: '',
        cgst: '',
        sgst: '',
        igst: '',
        roundOff: '',
        total: '',
        lines: [],
        applied: false,
      };
      save({ mode: 'scan', invoices: [...invoices.filter((entry) => entry.applied), invoice] });
      setCapturing(false);
      setPages([]);
      setDiff(null);
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

  function discard(): void {
    if (current) void releaseAiJob(current.jobId);
    save({ invoices: invoices.filter((entry) => entry.key !== current?.key) });
  }

  function apply(invoice: OnboardingInvoiceDraft): void {
    const before = marginSnapshot(data, menuSkipped);
    const result = applyInvoice(inventory.rows, invoice);
    const after = marginSnapshot(
      { ...data, inventory: { ...inventory, rows: result.rows } },
      menuSkipped,
    );
    const changes = marginDiff(before, after).map(({ key, name, before: b, after: a }) => ({
      key,
      name,
      before: b,
      after: a,
    }));
    setDiff({
      key: invoice.key,
      updated: result.updated,
      skipped: result.skipped,
      undo: { rows: inventory.rows, invoices },
    });
    save({
      rows: result.rows,
      invoices: invoices.map((entry) =>
        entry.key === invoice.key ? { ...invoice, applied: true, marginChanges: changes } : entry,
      ),
    });
    void releaseAiJob(invoice.jobId);
  }

  async function onRetakeFile(file: File | undefined): Promise<void> {
    const page = retakePage.current;
    if (!file || !page || !current) return;
    try {
      const [photo] = await prepareScanPages([file], 1);
      if (!photo) return;
      setInvoice({ ...current, lines: [] });
      await retakeScanPage('invoice', current.jobId, page, photo);
      refetch();
    } catch (error) {
      setUploadError(getApiErrorMessage(error, "We couldn't retake that page. Try again."));
    }
  }

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
  const fromRecipes = inventory.rows.filter((row) => row.origin === 'recipe').length;
  const fromInvoice = inventory.rows.filter((row) => row.costSource === 'invoice').length;
  const highlight = new Set<string>();

  if (failure) {
    return {
      highlight,
      content: (
        <AiFailureState
          kind={failure}
          noun="invoice"
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
      ),
    };
  }

  // ---- No invoice in progress: pre-filled list (and the diff after applying one) ----
  if (!current) {
    const applied = diff ? invoices.find((invoice) => invoice.key === diff.key) : undefined;
    if (applied && diff) {
      const rows = new Map((data.menu?.rows ?? []).map((row) => [row.key, row]));
      const target = recipeTarget(data);
      const changes: MarginChangeRow[] = (applied.marginChanges ?? []).map((change) => ({
        ...change,
        diet: (rows.get(change.key)?.dietType ?? null) as DietType | null,
        bandBefore: costBand(change.before, target) as CostBand,
        bandAfter: costBand(change.after, target) as CostBand,
      }));
      const worse = changes.filter((change) => change.after > change.before).length;
      for (const line of applied.lines) if (line.ingredientKey) highlight.add(line.ingredientKey);
      return {
        highlight,
        sub: 'Real costs are in. Estimated prices become From invoice.',
        content: (
          <>
            <Alert
              tone="ok"
              icon={<BarChart3 aria-hidden />}
              className="items-center"
              action={
                <button
                  type="button"
                  className={btn('default', 'sm')}
                  onClick={() => {
                    save(diff.undo);
                    setDiff(null);
                  }}
                >
                  Undo
                </button>
              }
            >
              <div className="text-sm font-semibold">
                Real costs for {diff.updated} ingredient{diff.updated === 1 ? '' : 's'} →{' '}
                {changes.length} dish
                {changes.length === 1 ? "'s" : "es'"} margins updated
              </div>
              <div className="text-[13px] opacity-80">
                {changes.length
                  ? `Of the dishes you reviewed, ${worse} cost more to make and ${changes.length - worse} cost less.`
                  : 'No dish moved by half a point or more.'}
                {diff.skipped
                  ? ` ${diff.skipped} line${diff.skipped === 1 ? ' was' : 's were'} skipped: the unit didn't match the ingredient.`
                  : ''}
              </div>
            </Alert>
            <div className="flex flex-col items-start gap-5 lg:flex-row">
              <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lg font-semibold tracking-[-0.01em]">
                    {inventory.rows.length} ingredients
                  </span>
                  <span className="flex gap-2">
                    <PriceSourceChip source="invoice" label={`${fromInvoice} from invoice`} />
                    <PriceSourceChip
                      source="estimated"
                      label={`${inventory.rows.length - fromInvoice} estimated`}
                    />
                  </span>
                </div>
                {table(highlight, true)}
              </div>
              <MarginDiffList changes={changes} />
            </div>
            <button
              type="button"
              className={`${btn('default', 'sm')} self-start`}
              onClick={() => setDiff(null)}
            >
              <Plus aria-hidden />
              Scan another invoice
            </button>
          </>
        ),
      };
    }
    return {
      highlight,
      sub: fromRecipes
        ? 'Pre-filled from the recipes you just reviewed.'
        : 'The ingredients you stock, with opening quantity and real cost.',
      content: (
        <>
          {fromRecipes > 0 && !capturing && (
            <Alert
              tone="ai"
              icon={<Sparkles aria-hidden />}
              className="items-center"
              action={
                <button type="button" className={btn('ai')} onClick={() => setCapturing(true)}>
                  <Receipt aria-hidden />
                  Scan an invoice
                </button>
              }
            >
              <b>{fromRecipes} ingredients from your recipes.</b> Scan a supplier invoice and
              we&apos;ll fill in real quantities and prices.
            </Alert>
          )}
          {capturing ? (
            <ScanCapture
              noun="invoice"
              pages={pages}
              onPagesChange={setPages}
              error={uploadError}
              inlineStart={{
                label:
                  `Read ${pages.length || ''} ${pages.length === 1 ? 'page' : 'pages'}`.replace(
                    '  ',
                    ' ',
                  ),
                busy: uploading,
                onStart: () => void start(),
              }}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-dashed border-zinc-300 bg-muted p-[18px] dark:border-zinc-700">
              <span className="flex size-11 items-center justify-center rounded-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                <Receipt className="size-[22px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  Photograph or drop a supplier&apos;s GST invoice
                </div>
                <div className="text-[13px] text-muted-foreground">
                  Printed, thermal or handwritten. We match each line to an ingredient.
                </div>
              </div>
              <button type="button" className={btn('primary')} onClick={() => setCapturing(true)}>
                <Receipt aria-hidden />
                Scan invoice
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-lg font-semibold tracking-[-0.01em]">
              {inventory.rows.length} ingredients
            </span>
            {inventory.rows.length > 0 && fromInvoice === 0 && (
              <span className="text-[13px] text-muted-foreground">
                All prices are <b>Estimated market price</b>
              </span>
            )}
          </div>
          {table(highlight)}
        </>
      ),
    };
  }

  if (!job) {
    return {
      highlight,
      content: <div className="h-60 animate-pulse rounded-[10px] bg-muted" aria-busy="true" />,
    };
  }

  // ---- Reading ----
  if (isActiveJob(job)) {
    const lines = items.flatMap((item) => {
      const line = invoiceScanLineSchema.safeParse(item.data);
      return line.success ? [{ seq: item.seq, page: item.page ?? 1, line: line.data }] : [];
    });
    const last = lines[lines.length - 1];
    const page = job.pages.find((entry) => entry.status === 'reading')?.page ?? last?.page ?? 1;
    return {
      highlight,
      note: 'Reading invoice…',
      floating: <FloatingAiProgress label={`Reading invoice · line ${lines.length + 1}`} />,
      primary: (
        <button type="button" className={btn('primary')} disabled>
          Apply to ingredients
        </button>
      ),
      content: (
        <div className="flex flex-col items-start gap-5 lg:flex-row">
          <InvoicePhotoCard
            jobId={job.id}
            page={page}
            pages={job.pagesTotal}
            available={job.imagesAvailable}
            reading
            highlight={last?.page === page ? last.line.source : null}
            label={last?.line.description}
          />
          <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-lg font-semibold tracking-[-0.01em]" aria-live="polite">
                {lines.length} lines read
              </span>
              <button
                type="button"
                className={btn('ghost', 'sm')}
                onClick={() => void cancelAiJob(job.id).then(refetch)}
              >
                Stop reading
              </button>
            </div>
            <GridTable label="Invoice lines read so far">
              <GridHead cols={READ_COLS}>
                <span>Invoice line</span>
                <span>Confidence</span>
                <span className="text-right">Amount</span>
              </GridHead>
              {lines.map(({ seq, line }, index) => (
                <GridRow
                  key={seq}
                  cols={READ_COLS}
                  tone={index === lines.length - 1 ? 'new' : 'default'}
                  className="min-h-[56px]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[12.5px]">{line.rawText}</div>
                    <div className="text-xs text-muted-foreground">{line.description}</div>
                  </div>
                  <div>
                    <ConfidenceBadge value={line.confidence} />
                  </div>
                  <div className="text-right font-mono text-sm tabular-nums">₹{line.amount}</div>
                </GridRow>
              ))}
            </GridTable>
          </div>
        </div>
      ),
    };
  }

  // ---- Read finished ----
  if (current.lines.length === 0) {
    if (job.status === 'FAILED' || items.length === 0) {
      return {
        highlight,
        content: (
          <AiFailureState
            kind={job.errorCode ?? 'UNREADABLE'}
            noun="invoice"
            actions={
              <>
                <button
                  type="button"
                  className={btn('primary', 'sm')}
                  onClick={() => {
                    discard();
                    setCapturing(true);
                  }}
                >
                  Retake photos
                </button>
                {switchButtons}
              </>
            }
          />
        ),
      };
    }
    return {
      highlight,
      content: <div className="h-60 animate-pulse rounded-[10px] bg-muted" aria-busy="true" />,
    };
  }

  const total = checkInvoiceTotal(current);
  const usable = applicableLines(current).length;
  const unresolved = current.lines.filter(
    (line) => !line.ignored && !line.ingredientKey && !line.newIngredientName?.trim(),
  ).length;
  return {
    highlight,
    note: !total.ok
      ? 'Fix the total check to apply real costs.'
      : unresolved
        ? `Resolve ${unresolved} line${unresolved === 1 ? '' : 's'} to apply real costs.`
        : 'Ready to apply real costs.',
    primary: (
      <button
        type="button"
        className={btn('primary')}
        disabled={!total.ok || usable === 0 || unresolved > 0}
        onClick={() => apply(current)}
      >
        Apply to {usable} ingredient{usable === 1 ? '' : 's'}
      </button>
    ),
    content: (
      <>
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
        <PartialReadBanner
          job={job}
          onRetake={(page) => {
            retakePage.current = page;
            retakeInput.current?.click();
          }}
        />
        <div className="flex flex-col items-start gap-5 lg:flex-row">
          <InvoicePhotoCard
            jobId={job.id}
            page={1}
            pages={job.pagesTotal}
            available={job.imagesAvailable}
            reading={false}
          />
          <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
            <InvoiceHeaderCard invoice={current} onChange={setInvoice} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-lg font-semibold tracking-[-0.01em]">
                {current.lines.length} of {current.lines.length} lines read
              </span>
              {unresolved > 0 && (
                <span className="text-[13px] text-muted-foreground">
                  {unresolved} line{unresolved === 1 ? ' needs' : 's need'} a choice
                </span>
              )}
            </div>
            <InvoiceLinesTable invoice={current} candidates={candidates} onChange={setInvoice} />
            <InvoiceTotalAlert invoice={current} />
            <button type="button" className={`${btn('ghost', 'sm')} self-start`} onClick={discard}>
              Discard this invoice
            </button>
          </div>
        </div>
      </>
    ),
  };
}
