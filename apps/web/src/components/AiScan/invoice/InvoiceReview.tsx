'use client';

import {
  type CostBand,
  formatInr,
  matchName,
  type OnboardingInvoiceDraft,
  type OnboardingInvoiceLineDraft,
  parseDecimal,
  parsePackSize,
} from '@rms/api-contract';
import { cn } from 'cn';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  ChevronDown,
  CircleCheck,
  Pencil,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';

import {
  Alert,
  btn,
  Card,
  CellInput,
  CellSelect,
  Chip,
  GridHead,
  GridRow,
  GridTable,
  Tag,
} from '@/containers/Onboarding/ui/kit';

import { ConfidenceBadge, CostBandBadge, DietMarker } from '../markers';
import { checkInvoiceTotal, lineUnitCost, type MatchCandidate } from './invoice-lines';

const LINE_COLS = 'minmax(170px,1.1fr) minmax(220px,1.3fr) minmax(130px,1fr) 110px';

const money = (value: string): string => {
  const parsed = parseDecimal(value);
  return parsed === null ? '—' : formatInr(parsed, 2);
};

/** Invoice header (board "invoice scan"): supplier, GSTIN, number · date, GST breakdown. */
export function InvoiceHeaderCard({
  invoice,
  onChange,
}: {
  invoice: OnboardingInvoiceDraft;
  onChange: (invoice: OnboardingInvoiceDraft) => void;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  const set = (patch: Partial<OnboardingInvoiceDraft>): void => onChange({ ...invoice, ...patch });
  const field = (
    key: keyof OnboardingInvoiceDraft,
    label: string,
    money_ = false,
  ): ReactElement => (
    <label className="flex flex-col gap-1">
      <Tag>{label}</Tag>
      <CellInput
        value={String(invoice[key] ?? '')}
        inputMode={money_ ? 'decimal' : undefined}
        onChange={(event) => set({ [key]: event.target.value })}
        className={cn('mx-0 w-full', money_ && 'tabular-nums')}
      />
    </label>
  );
  const date = /^\d{4}-\d{2}-\d{2}$/.test(invoice.invoiceDate)
    ? new Date(`${invoice.invoiceDate}T00:00:00`).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : invoice.invoiceDate || '—';

  return (
    <Card className="px-4 py-3.5">
      {editing ? (
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
          {field('supplierName', 'Supplier')}
          {field('supplierGstin', 'GSTIN')}
          {field('invoiceNumber', 'Invoice no.')}
          {field('invoiceDate', 'Date (YYYY-MM-DD)')}
          {field('cgst', 'CGST', true)}
          {field('sgst', 'SGST', true)}
          {field('igst', 'IGST', true)}
          {field('roundOff', 'Round-off', true)}
          {field('total', 'Invoice total', true)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
          <div>
            <Tag>Supplier</Tag>
            <div className="mt-0.5 font-semibold">{invoice.supplierName || '—'}</div>
          </div>
          <div>
            <Tag>GSTIN</Tag>
            <div className="mt-0.5 font-mono">{invoice.supplierGstin || '—'}</div>
          </div>
          <div>
            <Tag>Invoice no. · date</Tag>
            <div className="mt-0.5">
              {invoice.invoiceNumber || '—'} · {date}
            </div>
          </div>
          <div>
            <Tag>Tax</Tag>
            <div className="mt-0.5">
              CGST {money(invoice.cgst)} · SGST {money(invoice.sgst)}
            </div>
            <div className="text-xs text-muted-foreground">
              IGST {money(invoice.igst)} · Total {money(invoice.total)}
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        className={cn(btn('ghost', 'sm'), '-ml-2 mt-2')}
        onClick={() => setEditing(!editing)}
      >
        <Pencil aria-hidden />
        {editing ? 'Done' : 'Edit details'}
      </button>
    </Card>
  );
}

const NEW = '__new__';
const IGNORE = '__ignore__';

/** Match dropdown (board "Components: trust, cost, match"): candidates with confidence, or add as new. */
function MatchDropdown({
  line,
  candidates,
  onPick,
}: {
  line: OnboardingInvoiceLineDraft;
  candidates: readonly MatchCandidate[];
  onPick: (choice: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const options = matchName(`${line.description} ${line.rawText}`, candidates, {
    limit: 3,
    minScore: 30,
  });
  const others = candidates.filter(
    (candidate) => !options.some((option) => option.key === candidate.key),
  );
  const chosen = line.ingredientKey
    ? candidates.find((candidate) => candidate.key === line.ingredientKey)
    : null;
  const unresolved = !line.ignored && !line.ingredientKey && !line.newIngredientName?.trim();
  const pick = (choice: string): void => {
    onPick(choice);
    setOpen(false);
  };
  const item =
    'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none';

  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Ingredient for ${line.description}`}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-2.5 text-sm',
          open
            ? 'border-foreground shadow-[0_0_0_3px_var(--border)]'
            : unresolved
              ? 'border-red-700'
              : 'border-zinc-300 dark:border-zinc-700',
        )}
      >
        <span className="truncate">
          {line.ignored ? (
            <span className="text-muted-foreground">Not an ingredient</span>
          ) : chosen ? (
            <b>{chosen.name}</b>
          ) : line.newIngredientName?.trim() ? (
            <span>
              <b>{line.newIngredientName}</b> <span className="text-muted-foreground">(new)</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Choose…</span>
          )}
        </span>
        <span className="flex flex-none items-center gap-2">
          {chosen && line.matchScore !== null && <ConfidenceBadge value={line.matchScore} />}
          <ChevronDown className="size-3.5" aria-hidden />
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute top-10 right-[-30px] left-0 z-30 max-h-80 overflow-y-auto rounded-[10px] border border-border bg-popover p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.22)]"
        >
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="option"
              aria-selected={option.key === line.ingredientKey}
              className={item}
              onClick={() => pick(option.key)}
            >
              <b className="truncate">{option.name}</b>
              <ConfidenceBadge value={option.score} />
            </button>
          ))}
          {others.length > 0 && (
            <>
              <div className="px-2.5 pt-2 pb-1 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                Other ingredients
              </div>
              {others.map((candidate) => (
                <button
                  key={candidate.key}
                  type="button"
                  role="option"
                  aria-selected={candidate.key === line.ingredientKey}
                  className={item}
                  onClick={() => pick(candidate.key)}
                >
                  <span className="truncate">{candidate.name}</span>
                </button>
              ))}
            </>
          )}
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="option"
            aria-selected={false}
            className={cn(item, 'justify-start')}
            onClick={() => pick(NEW)}
          >
            <Plus className="size-3.5" aria-hidden />
            <b>Add &quot;{line.description}&quot; as new ingredient</b>
          </button>
          <button
            type="button"
            role="option"
            aria-selected={line.ignored === true}
            className={cn(item, 'justify-start text-muted-foreground')}
            onClick={() => pick(IGNORE)}
          >
            Not an ingredient (skip)
          </button>
        </div>
      )}
    </div>
  );
}

/** Invoice lines matched to ingredients, with converted opening quantity and real unit cost. */
export function InvoiceLinesTable({
  invoice,
  candidates,
  onChange,
}: {
  invoice: OnboardingInvoiceDraft;
  candidates: readonly MatchCandidate[];
  onChange: (invoice: OnboardingInvoiceDraft) => void;
}): ReactElement {
  const updateLine = (key: string, patch: Partial<OnboardingInvoiceLineDraft>): void =>
    onChange({
      ...invoice,
      lines: invoice.lines.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        return { ...next, unitCost: lineUnitCost(next) };
      }),
    });

  return (
    <GridTable label="Invoice lines" className="overflow-visible">
      <GridHead cols={LINE_COLS}>
        <span>Invoice line</span>
        <span>Matches ingredient</span>
        <span>Opening qty</span>
        <span className="text-right">Unit cost</span>
      </GridHead>
      {invoice.lines.map((line) => {
        const unit = line.baseUnit.toUpperCase();
        const cost = parseDecimal(line.unitCost);
        const pack = parsePackSize(line.rawText);
        const unresolved = !line.ignored && !line.ingredientKey && !line.newIngredientName?.trim();
        const perLabel = unit === 'UNIT' ? 'unit' : unit === 'ML' ? 'l' : 'kg';
        return (
          <GridRow
            key={line.key}
            cols={LINE_COLS}
            tone={unresolved ? 'problem' : line.ignored ? 'out' : 'default'}
            className="min-h-[60px] py-2"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-[12.5px]">{line.rawText}</div>
              <div className="font-mono text-[11.5px] text-muted-foreground">
                = {money(line.amount)}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <MatchDropdown
                line={line}
                candidates={candidates}
                onPick={(choice) => {
                  if (choice === IGNORE) updateLine(line.key, { ignored: true });
                  else if (choice === NEW)
                    updateLine(line.key, {
                      ignored: false,
                      ingredientKey: null,
                      matchScore: null,
                      newIngredientName: line.newIngredientName || line.description,
                    });
                  else {
                    const candidate = candidates.find((entry) => entry.key === choice);
                    updateLine(line.key, {
                      ignored: false,
                      ingredientKey: choice,
                      matchScore:
                        matchName(`${line.description} ${line.rawText}`, candidates, {
                          limit: 10,
                          minScore: 0,
                        }).find((o) => o.key === choice)?.score ?? null,
                      ...(candidate && !line.baseQuantity && { baseUnit: candidate.baseUnit }),
                    });
                  }
                }}
              />
              {!line.ingredientKey && !line.ignored && line.newIngredientName !== undefined && (
                <CellInput
                  aria-label={`New ingredient name for ${line.description}`}
                  value={line.newIngredientName}
                  onChange={(event) =>
                    updateLine(line.key, { newIngredientName: event.target.value })
                  }
                  className="mx-0 w-full text-[13px]"
                />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1">
                <CellInput
                  aria-label={`Opening quantity from ${line.description}`}
                  inputMode="decimal"
                  value={line.baseQuantity}
                  onChange={(event) => updateLine(line.key, { baseQuantity: event.target.value })}
                  className="mx-0 w-24 font-semibold tabular-nums"
                />
                <CellSelect
                  aria-label={`Unit for ${line.description}`}
                  value={unit}
                  onChange={(event) => updateLine(line.key, { baseUnit: event.target.value })}
                  className="w-[62px] border-transparent px-0.5"
                >
                  <option value="G">g</option>
                  <option value="ML">ml</option>
                  <option value="UNIT">unit</option>
                </CellSelect>
              </div>
              <div className="text-xs text-muted-foreground">
                {line.baseQuantity
                  ? pack
                    ? `${pack.size} ${pack.unit.toLowerCase()} packs`
                    : 'as printed'
                  : 'Enter the quantity bought'}
              </div>
            </div>
            <div className="text-right font-bold tabular-nums">
              {cost === null
                ? '—'
                : `₹${Math.round(unit === 'UNIT' ? cost : cost * 1000)}/${perLabel}`}
            </div>
          </GridRow>
        );
      })}
    </GridTable>
  );
}

/** "Totals match" (lines + taxes + round-off = invoice total) or what's off. */
export function InvoiceTotalAlert({ invoice }: { invoice: OnboardingInvoiceDraft }): ReactElement {
  const total = checkInvoiceTotal(invoice);
  const lines = invoice.lines.reduce((sum, line) => sum + (parseDecimal(line.amount) ?? 0), 0);
  const parts = `Lines ${formatInr(lines, 2)}${invoice.cgst ? ` + CGST ${money(invoice.cgst)}` : ''}${invoice.sgst ? ` + SGST ${money(invoice.sgst)}` : ''}${invoice.igst ? ` + IGST ${money(invoice.igst)}` : ''}${invoice.roundOff ? ` + round-off ${money(invoice.roundOff)}` : ''}`;
  if (total.ok) {
    return (
      <Alert
        tone="ok"
        role="status"
        icon={<CircleCheck aria-hidden />}
        action={<Chip tone="ok">Check passed</Chip>}
      >
        <b>Totals match.</b>{' '}
        <span className="tabular-nums">
          {parts} = <b>{formatInr(total.computed, 2)}</b>
        </span>
        , the same as the invoice total.
      </Alert>
    );
  }
  return (
    <Alert
      tone="bad"
      role="alert"
      icon={<TriangleAlert aria-hidden />}
      action={<Chip tone="bad">Check failed</Chip>}
    >
      <b>Totals don&apos;t match.</b>{' '}
      {total.delta === null ? (
        'Enter the invoice total (Edit details) to check it.'
      ) : (
        <span className="tabular-nums">
          {parts} = {formatInr(total.computed, 2)}, but the invoice says {money(invoice.total)} (off
          by {formatInr(Math.abs(total.delta), 2)}). Fix a line or a tax amount before applying
          costs.
        </span>
      )}
    </Alert>
  );
}

/** Header + lines + total check (used after onboarding too). */
export function InvoiceReview({
  invoice,
  candidates,
  onChange,
}: {
  invoice: OnboardingInvoiceDraft;
  candidates: readonly MatchCandidate[];
  onChange: (invoice: OnboardingInvoiceDraft) => void;
}): ReactElement {
  const unresolved = invoice.lines.filter(
    (line) => !line.ignored && !line.ingredientKey && !line.newIngredientName?.trim(),
  ).length;
  return (
    <div className="flex flex-col gap-3">
      <InvoiceHeaderCard invoice={invoice} onChange={onChange} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-semibold tracking-[-0.01em]">
          {invoice.lines.length} lines read
        </span>
        {unresolved > 0 && (
          <span className="text-[13px] text-muted-foreground">
            {unresolved} line{unresolved === 1 ? ' needs' : 's need'} a choice
          </span>
        )}
      </div>
      <InvoiceLinesTable invoice={invoice} candidates={candidates} onChange={onChange} />
      <InvoiceTotalAlert invoice={invoice} />
    </div>
  );
}

export type MarginChangeRow = {
  key: string;
  name: string;
  before: number;
  after: number;
  diet?: import('@rms/api-contract').DietType | null;
  bandBefore?: CostBand | null;
  bandAfter?: CostBand | null;
};

/** "Food cost: before → after" (board "live margin update"): arrows and words, not colour only. */
export function MarginDiffList({
  changes,
  limit = 12,
}: {
  changes: readonly MarginChangeRow[];
  limit?: number;
}): ReactElement {
  return (
    <Card className="w-full flex-none overflow-hidden lg:w-[440px]">
      <div className="flex min-h-[50px] items-center gap-2 border-b border-border px-3.5">
        <h3 className="text-sm font-semibold">Food cost: before → after</h3>
        <span className="flex-1" />
        <span className="text-[12.5px] text-muted-foreground">Biggest changes first</span>
      </div>
      {changes.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          No dish&apos;s food cost moved by half a point or more.
        </p>
      ) : (
        <ol>
          {changes.slice(0, limit).map((change) => {
            const worse = change.after > change.before;
            return (
              <li
                key={change.key}
                className="flex min-h-[52px] items-center gap-2.5 border-b border-border px-3.5 py-2 last:border-b-0"
              >
                {change.diet !== undefined && <DietMarker diet={change.diet} showLabel={false} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{change.name}</div>
                  {change.bandBefore &&
                    change.bandAfter &&
                    change.bandBefore !== change.bandAfter && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CostBandBadge band={change.bandBefore} /> →{' '}
                        <CostBandBadge band={change.bandAfter} />
                      </span>
                    )}
                </div>
                <span className="text-muted-foreground tabular-nums line-through">
                  {Math.round(change.before)}%
                </span>
                <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                <span
                  className={cn(
                    'flex min-w-[104px] items-center justify-end gap-1 font-bold',
                    worse
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400',
                  )}
                >
                  {worse ? (
                    <ArrowUp className="size-[13px]" aria-hidden />
                  ) : (
                    <ArrowDown className="size-[13px]" aria-hidden />
                  )}
                  <span className="tabular-nums">{Math.round(change.after)}%</span>
                  <span className="text-[11.5px] font-semibold">
                    {worse ? 'costs more' : 'costs less'}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {changes.length > limit && (
        <p className="px-3.5 py-3 text-[13px] text-muted-foreground">
          + {changes.length - limit} more dishes
        </p>
      )}
    </Card>
  );
}

/** Summary banner + list, used after saving a receipt outside onboarding. */
export function MarginDiffPanel({
  title,
  changes,
}: {
  title: string;
  changes: readonly MarginChangeRow[];
}): ReactElement {
  const worse = changes.filter((change) => change.after > change.before).length;
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="ok" icon={<BarChart3 aria-hidden />}>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-[13px] opacity-80">
          {worse} {worse === 1 ? 'dish costs' : 'dishes cost'} more to make and{' '}
          {changes.length - worse} cost less.
        </div>
      </Alert>
      <MarginDiffList changes={changes} />
    </div>
  );
}
