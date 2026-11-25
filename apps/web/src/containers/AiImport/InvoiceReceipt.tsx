'use client';

import {
  type InventoryReceipt,
  inventoryReceiptSchema,
  type InvoiceScanLine,
  invoiceScanLineSchema,
  type MarginPreviewResponse,
  type OnboardingInvoiceDraft,
  parseDecimal,
  type ReceiptChecksResponse,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useEffect, useState } from 'react';

import {
  type AiFailureKind,
  AiFailureState,
  FloatingAiProgress,
} from '@/components/AiScan/AiStates';
import {
  applicableLines,
  checkInvoiceTotal,
  invoiceFromScan,
  type MatchCandidate,
} from '@/components/AiScan/invoice/invoice-lines';
import { InvoiceReview, MarginDiffPanel } from '@/components/AiScan/invoice/InvoiceReview';
import { InvoiceStreaming } from '@/components/AiScan/invoice/InvoiceStreaming';
import { ScanCapture } from '@/components/AiScan/ScanCapture';
import { Button, buttonVariants } from '@/components/ui/button';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import { isActiveJob, useAiJob } from '@/hooks/useAiJob';
import { api } from '@/lib/api';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api-error';
import type { ScanPage } from '@/lib/scan-images';
import {
  cancelAiJob,
  checkReceipt,
  createScan,
  previewMargins,
  releaseAiJob,
} from '@/services/api/requests/ai';
import { useInventoryOptions } from '@/services/api/requests/inventory';

/**
 * Inventory → Scan invoice (after setup): the invoice becomes a real goods receipt. Supplier matched
 * by GSTIN (or created), invoice number and date kept, lines become stock batches (batch number and
 * expiry when printed), with duplicate-invoice and price-jump warnings and a before → after margin
 * diff.
 */
export default function InvoiceReceipt(): ReactElement | null {
  const allowed = usePermissionGuard([Permission.INVENTORY_SCAN_INVOICE]);
  const queryClient = useQueryClient();
  const options = useInventoryOptions(allowed);
  const [jobId, setJobId] = useState<string>();
  const [invoice, setInvoice] = useState<OnboardingInvoiceDraft | null>(null);
  const [failure, setFailure] = useState<AiFailureKind | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [error, setError] = useState<string>();
  const [checks, setChecks] = useState<ReceiptChecksResponse | null>(null);
  const [preview, setPreview] = useState<MarginPreviewResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<InventoryReceipt | null>(null);
  const { job, items, refetch } = useAiJob(jobId);

  const candidates: MatchCandidate[] = (options.data?.items ?? []).map((item) => ({
    key: item.id,
    name: item.name,
    baseUnit: item.baseUnit,
  }));
  const scanned = new Map<string, InvoiceScanLine>(
    items.flatMap((item) => {
      const line = invoiceScanLineSchema.safeParse(item.data);
      return line.success && job ? [[`${job.id.slice(0, 8)}-${item.seq}`, line.data] as const] : [];
    }),
  );

  useEffect(() => {
    if (!job || isActiveJob(job) || invoice || items.length === 0 || !options.data) return;
    setInvoice(invoiceFromScan(job.id, job, items, candidates));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, items, options.data]);

  // Warnings (duplicate invoice, price jumps) and the margin preview follow the matched lines.
  const matched = invoice ? applicableLines(invoice).filter((line) => line.ingredientKey) : [];
  const matchKey = matched.map((line) => `${line.ingredientKey}:${line.unitCost}`).join('|');
  useEffect(() => {
    if (!invoice) return;
    const timer = window.setTimeout(() => {
      void checkReceipt({
        ...(invoice.supplierGstin.trim() && { supplierGstin: invoice.supplierGstin.trim() }),
        ...(invoice.invoiceNumber.trim() && {
          supplierInvoiceNumber: invoice.invoiceNumber.trim(),
        }),
        lines: matched
          .slice(0, 50)
          .map((line) => ({ stockItemId: line.ingredientKey!, unitCost: line.unitCost })),
      })
        .then(setChecks)
        .catch(() => setChecks(null));
      if (matched.length) {
        void previewMargins({
          costs: matched
            .slice(0, 200)
            .map((line) => ({ stockItemId: line.ingredientKey!, unitCost: line.unitCost })),
        })
          .then(setPreview)
          .catch(() => setPreview(null));
      }
    }, 500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchKey, invoice?.supplierGstin, invoice?.invoiceNumber]);

  if (!allowed) return null;

  async function start(pages: Parameters<typeof createScan>[1]): Promise<void> {
    setUploading(true);
    setError(undefined);
    try {
      const result = await createScan('invoice', pages, 'POST_ONBOARDING');
      setInvoice(null);
      setJobId(result.job.id);
    } catch (reason) {
      const code = getApiErrorCode(reason);
      if (code === 'AI_QUOTA_EXCEEDED') setFailure('QUOTA');
      else if (code === 'AI_UNAVAILABLE') setFailure('AI_UNAVAILABLE');
      else setError(getApiErrorMessage(reason, 'The upload failed. Try again.'));
    } finally {
      setUploading(false);
    }
  }

  function reset(): void {
    if (jobId && !saved) void releaseAiJob(jobId);
    setJobId(undefined);
    setInvoice(null);
    setChecks(null);
    setPreview(null);
    setSaved(null);
    setError(undefined);
  }

  async function save(acknowledgeDuplicate: boolean): Promise<void> {
    if (!invoice) return;
    setSaving(true);
    setError(undefined);
    try {
      // Lines marked "add as new" become ingredients first.
      const lines = [];
      for (const line of applicableLines(invoice)) {
        let stockItemId = line.ingredientKey;
        if (!stockItemId) {
          const created = await api.post(
            '/inventory/items',
            {
              name: line.newIngredientName!.trim(),
              sku: '',
              baseUnit: line.baseUnit.toUpperCase(),
              reorderLevel: '0',
            },
            { errorDisplay: 'inline' },
          );
          stockItemId = (created.data as { id: string }).id;
        }
        const printed = scanned.get(line.key);
        lines.push({
          stockItemId,
          quantity: String(Math.round((parseDecimal(line.baseQuantity) ?? 0) * 1000) / 1000),
          unitCost: line.unitCost,
          unit: line.baseUnit.toUpperCase(),
          batchNumber: printed?.batchNumber ?? '',
          ...(printed?.expiryDate && { expiryDate: printed.expiryDate }),
        });
      }
      const response = await api.post(
        '/inventory/goods-receipts',
        {
          idempotencyKey: crypto.randomUUID(),
          ...(checks?.supplier
            ? { supplierId: checks.supplier.id }
            : {
                newSupplier: {
                  name: invoice.supplierName.trim() || 'Supplier',
                  ...(invoice.supplierGstin.trim() && { gstin: invoice.supplierGstin.trim() }),
                },
              }),
          notes: invoice.invoiceNumber
            ? `Scanned invoice ${invoice.invoiceNumber}`
            : 'Scanned invoice',
          lines,
          ...(invoice.invoiceNumber.trim() && {
            invoice: {
              supplierInvoiceNumber: invoice.invoiceNumber.trim(),
              ...(/^\d{4}-\d{2}-\d{2}$/.test(invoice.invoiceDate) && {
                supplierInvoiceDate: invoice.invoiceDate,
              }),
              ...(parseDecimal(invoice.total) !== null && { invoiceTotal: invoice.total.trim() }),
              taxBreakdown: {
                cgst: invoice.cgst.trim() || null,
                sgst: invoice.sgst.trim() || null,
                igst: invoice.igst.trim() || null,
                roundOff: invoice.roundOff.trim() || null,
              },
            },
          }),
          ...(jobId && { scanJobId: jobId }),
          ...(acknowledgeDuplicate && { acknowledgeDuplicate: true }),
        },
        { errorDisplay: 'inline' },
      );
      setSaved(inventoryReceiptSchema.parse(response.data));
      void queryClient.invalidateQueries();
    } catch (reason) {
      setError(
        getApiErrorMessage(reason, "The receipt wasn't saved. Nothing was recorded; try again."),
      );
    } finally {
      setSaving(false);
    }
  }

  const total = invoice ? checkInvoiceTotal(invoice) : null;
  const usable = invoice ? applicableLines(invoice).length : 0;
  const names = new Map(candidates.map((candidate) => [candidate.key, candidate.name]));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/inventory"
          className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Inventory
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Scan supplier invoice</h1>
        <p className="text-sm text-muted-foreground">
          We read the invoice and match each line to an ingredient. You check it; then it is saved
          as a goods receipt.
        </p>
      </div>

      {saved ? (
        <div className="flex flex-col gap-4">
          <section
            className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-5"
            role="status"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold text-emerald-950">
              <CircleCheck className="size-5" aria-hidden />
              Saved as GRN-{saved.number} from {saved.supplier.name}
            </h2>
            <p className="text-sm text-emerald-950">
              {saved.lines.length} lines added to stock as new batches.
            </p>
          </section>
          {preview && (
            <MarginDiffPanel
              title={`Real costs for ${preview.ingredientsUpdated} ingredients → ${preview.dishesAffected} dishes' margins updated`}
              changes={preview.changes.map((change) => ({
                key: `${change.menuItemId}:${change.variantId ?? ''}`,
                name: change.name,
                before: change.before,
                after: change.after,
              }))}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Link href="/inventory" className={buttonVariants()}>
              Back to inventory
            </Link>
            <Button variant="outline" onClick={reset}>
              Scan another invoice
            </Button>
          </div>
        </div>
      ) : failure ? (
        <AiFailureState
          kind={failure}
          noun="invoice"
          actions={
            <Button className="h-11" onClick={() => setFailure(null)}>
              Back
            </Button>
          }
        />
      ) : !jobId ? (
        <ScanCapture
          noun="invoice"
          pages={pages}
          onPagesChange={setPages}
          error={error}
          inlineStart={{
            label: `Read ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`,
            busy: uploading,
            onStart: () => void start(pages),
          }}
        />
      ) : !job ? (
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" aria-busy="true" />
      ) : isActiveJob(job) ? (
        <>
          <FloatingAiProgress label={`Reading invoice · ${items.length} lines`} />
          <InvoiceStreaming
            job={job}
            items={items}
            stopping={false}
            onStop={() => void cancelAiJob(job.id).then(refetch)}
          />
        </>
      ) : !invoice ? (
        job.status === 'FAILED' || items.length === 0 ? (
          <AiFailureState
            kind={job.errorCode ?? 'UNREADABLE'}
            noun="invoice"
            actions={
              <Button className="h-11" onClick={reset}>
                Retake photos
              </Button>
            }
          />
        ) : (
          <div className="h-40 animate-pulse rounded-xl bg-neutral-100" aria-busy="true" />
        )
      ) : (
        <div className="flex flex-col gap-4">
          {checks?.supplier && (
            <p className="text-sm text-neutral-700">
              Supplier matched by GSTIN: <strong>{checks.supplier.name}</strong>
            </p>
          )}
          {checks?.duplicate && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
            >
              <TriangleAlert className="mt-0.5 size-4 flex-none" aria-hidden />
              Already recorded on{' '}
              {new Date(checks.duplicate.recordedAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
              })}{' '}
              (GRN-
              {checks.duplicate.number}). Saving again would add the stock twice.
            </p>
          )}
          {checks && checks.priceJumps.length > 0 && (
            <div
              className="flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
              role="status"
            >
              <span className="flex items-center gap-2 font-semibold">
                <TriangleAlert className="size-4" aria-hidden />
                Price changed since the last purchase
              </span>
              {checks.priceJumps.map((jump) => (
                <span key={jump.stockItemId}>
                  {names.get(jump.stockItemId)}: {jump.changePercent > 0 ? 'up' : 'down'}{' '}
                  {Math.abs(jump.changePercent)}%
                </span>
              ))}
            </div>
          )}
          <InvoiceReview invoice={invoice} candidates={candidates} onChange={setInvoice} />
          {preview && preview.changes.length > 0 && (
            <MarginDiffPanel
              title="If you save this invoice, food cost changes like this"
              changes={preview.changes.map((change) => ({
                key: `${change.menuItemId}:${change.variantId ?? ''}`,
                name: change.name,
                before: change.before,
                after: change.after,
              }))}
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" className="h-11" onClick={reset}>
              Discard
            </Button>
            <Button
              className="h-11 px-5"
              disabled={!total?.ok || usable === 0 || saving}
              onClick={() => void save(Boolean(checks?.duplicate))}
            >
              {saving
                ? 'Saving…'
                : checks?.duplicate
                  ? 'Save anyway as a new receipt'
                  : `Save receipt (${usable} lines)`}
            </Button>
          </div>
          {!total?.ok && (
            <p className="text-right text-sm text-red-700">Fix the total check before saving.</p>
          )}
        </div>
      )}
    </main>
  );
}
