'use client';

import {
  DIET_TYPE_LABELS,
  DIET_TYPES,
  type DietType,
  type OnboardingMenuRow,
  type OnboardingRowIssue,
} from '@rms/api-contract';
import { CircleCheck, Layers, Plus, TriangleAlert, Undo2, X } from 'lucide-react';
import { type KeyboardEvent, type ReactElement, useMemo, useState } from 'react';

import {
  btn,
  CellInput,
  CellSelect,
  CheckSquare,
  Chip,
  GridRow,
  GridTable,
  Kbd,
  KeyHint,
  Pills,
} from '@/containers/Onboarding/ui/kit';

import { ApprovedChip, ConfidenceBadge, DietMarker, EditedChip } from '../markers';
import { SourceSnippet, useScanPageUrl } from '../ScanPhoto';
import { isHighConfidence, markReviewed, type MenuReview, reviewMenuRows } from './menu-scan-rows';
import { MENU_COLS, MenuTableHead } from './MenuScanStreaming';

type Filter = 'attention' | 'duplicates' | 'not-dishes' | 'all';
const SHOWN_READY = 8;

function Snippet({
  row,
  jobId,
  imagesAvailable,
}: {
  row: OnboardingMenuRow;
  jobId?: string;
  imagesAvailable: boolean;
}): ReactElement | null {
  const page = row.ai?.source?.page;
  const url = useScanPageUrl(jobId, page, imagesAvailable && Boolean(page));
  if (!row.ai) return null;
  return <SourceSnippet url={url} box={row.ai.source} rawText={row.ai.rawText} />;
}

/**
 * Review of scanned rows (board "Menu scan: review"): problems first, each with the reason and the
 * photo snippet; likely duplicates and non-dishes start out left out; "Accept all high-confidence"
 * for the rest. Every value is editable in place. Keyboard: A accepts the first problem.
 */
export function MenuScanReview({
  rows,
  onChange,
  jobId,
  imagesAvailable,
  review: reviewProp,
}: {
  rows: readonly OnboardingMenuRow[];
  onChange: (rows: OnboardingMenuRow[]) => void;
  jobId?: string;
  imagesAvailable: boolean;
  review?: MenuReview;
}): ReactElement {
  const review = useMemo(() => reviewProp ?? reviewMenuRows(rows), [reviewProp, rows]);
  const [filter, setFilter] = useState<Filter>(review.attention > 0 ? 'attention' : 'all');
  const [showAll, setShowAll] = useState(false);

  const update = (key: string, patch: Partial<OnboardingMenuRow>, reviewed = true): void =>
    onChange(
      rows.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        return reviewed ? markReviewed(next) : next;
      }),
    );

  const order: Record<string, number> = { attention: 0, out: 1, ready: 2 };
  const sorted = [...rows].sort(
    (a, b) =>
      (order[review.groups.get(a.key) ?? 'ready'] ?? 2) -
      (order[review.groups.get(b.key) ?? 'ready'] ?? 2),
  );
  const filtered = sorted.filter((row) => {
    const group = review.groups.get(row.key);
    if (filter === 'attention') return group === 'attention';
    if (filter === 'duplicates') return row.ai?.flag === 'duplicate';
    if (filter === 'not-dishes') return row.ai?.flag === 'not_a_dish';
    return true;
  });
  // "Needs attention" also lists the rows to leave out, then a few ready ones (as on the board).
  const shown =
    filter === 'attention'
      ? [...filtered, ...sorted.filter((row) => review.groups.get(row.key) === 'out')]
      : filtered;
  const readyRows = sorted.filter((row) => review.groups.get(row.key) === 'ready');
  const nonReady = shown.filter((row) => review.groups.get(row.key) !== 'ready');
  const readyShown =
    filter === 'all' || filter === 'attention'
      ? readyRows.slice(0, showAll ? undefined : SHOWN_READY)
      : shown.filter((row) => review.groups.get(row.key) === 'ready');
  const visible = [...nonReady, ...readyShown];
  const hiddenReady =
    filter === 'all' || filter === 'attention' ? readyRows.length - readyShown.length : 0;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || event.metaKey || event.ctrlKey)
      return;
    if (event.key.toLowerCase() !== 'a') return;
    const first = sorted.find(
      (row) => review.groups.get(row.key) === 'attention' && !review.issuesByKey.has(row.key),
    );
    if (first) {
      event.preventDefault();
      update(first.key, {});
    }
  }

  return (
    <div className="flex flex-col gap-4" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="text-lg font-semibold tracking-[-0.01em] tabular-nums" aria-live="polite">
          {review.ready} ready · {review.attention} need attention · {review.out} to leave out
        </span>
        <span className="flex-1" />
        <button
          type="button"
          className={btn()}
          disabled={review.highConfidenceUnreviewed === 0}
          onClick={() =>
            onChange(
              rows.map((row) => (!row.excluded && isHighConfidence(row) ? markReviewed(row) : row)),
            )
          }
        >
          <CircleCheck aria-hidden />
          {review.highConfidenceUnreviewed
            ? `Accept all high-confidence (${review.highConfidenceUnreviewed})`
            : 'High-confidence accepted'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Pills
          label="Show rows"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'attention', label: `Needs attention · ${review.attention}` },
            { value: 'duplicates', label: `Likely duplicates · ${review.duplicates}` },
            { value: 'not-dishes', label: `Not dishes · ${review.notDishes}` },
            { value: 'all', label: `All ${rows.length}` },
          ]}
        />
        <span className="flex-1" />
        <KeyHint keyLabel="A">accept first problem</KeyHint>
      </div>

      <GridTable label="Menu rows">
        <MenuTableHead />
        {visible.map((row) => (
          <ReviewRow
            key={row.key}
            row={row}
            group={review.groups.get(row.key) ?? 'ready'}
            issues={review.issuesByKey.get(row.key) ?? []}
            jobId={jobId}
            imagesAvailable={imagesAvailable}
            onUpdate={(patch, reviewed) => update(row.key, patch, reviewed)}
          />
        ))}
        {visible.length === 0 && (
          <div className="px-3.5 py-6 text-center text-sm text-muted-foreground">Nothing here.</div>
        )}
        {hiddenReady > 0 && (
          <button
            type="button"
            className="flex w-full items-center px-3.5 py-3 text-left text-[13px] text-muted-foreground hover:bg-muted"
            onClick={() => setShowAll(true)}
          >
            + {hiddenReady} more ready rows
          </button>
        )}
      </GridTable>
    </div>
  );
}

function ReviewRow({
  row,
  group,
  issues,
  jobId,
  imagesAvailable,
  onUpdate,
}: {
  row: OnboardingMenuRow;
  group: 'attention' | 'ready' | 'out';
  issues: OnboardingRowIssue[];
  jobId?: string;
  imagesAvailable: boolean;
  onUpdate: (patch: Partial<OnboardingMenuRow>, reviewed?: boolean) => void;
}): ReactElement {
  const label = row.name || 'this row';
  const bad = (field: string): boolean => issues.some((issue) => issue.field === field);
  const variants = row.variants ?? [];

  if (group === 'out') {
    return (
      <GridRow cols={MENU_COLS} tone="out" className="bg-amber-50 opacity-70 dark:bg-amber-950/40">
        <CheckSquare on={false} label="Left out" />
        <div>
          <Chip tone="bad">
            {row.ai?.flag === 'duplicate' ? <Layers aria-hidden /> : <TriangleAlert aria-hidden />}
            {row.ai?.flag === 'duplicate'
              ? 'Likely duplicate'
              : row.ai?.flag === 'not_a_dish'
                ? 'Not a dish'
                : 'Left out'}
          </Chip>
        </div>
        <span className="text-muted-foreground">—</span>
        <span className="text-muted-foreground">—</span>
        <span className="text-muted-foreground">—</span>
        <div className="min-w-0">
          <div className="truncate py-1 text-sm font-medium line-through">{row.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.ai?.flagNote ?? 'You left this out.'} Left out.
          </div>
        </div>
        <div className="text-right">
          <button
            type="button"
            className={btn('default', 'sm')}
            onClick={() => onUpdate({ excluded: false })}
          >
            <Undo2 aria-hidden />
            Keep
          </button>
        </div>
      </GridRow>
    );
  }

  const attention = group === 'attention';
  return (
    <GridRow cols={MENU_COLS} tone={attention ? 'problem' : 'default'} className="group">
      <button
        type="button"
        onClick={() => onUpdate({ excluded: true }, false)}
        aria-label={`Leave out ${label}`}
        title="Leave out"
        className="rounded focus-visible:outline-2 focus-visible:outline-indigo-600"
      >
        <CheckSquare on={!attention} label={attention ? 'Needs checking' : 'Included'} />
      </button>
      <div>
        {!row.ai ? null : row.ai.reviewed ? (
          <ApprovedChip />
        ) : (
          <ConfidenceBadge value={row.ai.confidence} />
        )}
      </div>
      <div>
        <CellInput
          aria-label={`Category of ${label}`}
          value={row.category}
          invalid={bad('category')}
          onChange={(event) => onUpdate({ category: event.target.value })}
        />
      </div>
      <div>
        <CellSelect
          aria-label={`Type of ${label}`}
          value={row.type.toUpperCase()}
          onChange={(event) => onUpdate({ type: event.target.value })}
          className="w-[80px] px-1.5"
        >
          <option value="FOOD">FOOD</option>
          <option value="BAR">BAR</option>
        </CellSelect>
      </div>
      <div className="flex items-center gap-1">
        <DietMarker diet={row.dietType} showLabel={false} />
        <CellSelect
          aria-label={`Veg, non-veg or egg for ${label}`}
          value={row.dietType ?? ''}
          onChange={(event) =>
            onUpdate({ dietType: (event.target.value || null) as DietType | null })
          }
          className="w-[96px] border-transparent px-0.5 text-[12.5px]"
        >
          <option value="">—</option>
          {DIET_TYPES.map((diet) => (
            <option key={diet} value={diet}>
              {DIET_TYPE_LABELS[diet]}
            </option>
          ))}
        </CellSelect>
      </div>
      <div className="min-w-0">
        <CellInput
          aria-label={`Name of ${label}`}
          value={row.name}
          invalid={bad('name')}
          onChange={(event) => onUpdate({ name: event.target.value })}
          className="font-medium"
        />
        {row.originalName && (
          <div className="text-xs text-muted-foreground" lang="hi">
            {row.originalName}
          </div>
        )}
        {attention && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {row.ai?.issues.map((issue) => (
              <span key={issue} className="text-xs text-muted-foreground">
                {issue}
              </span>
            ))}
            {row.ai && row.ai.issues.length > 0 && (
              <Snippet row={row} jobId={jobId} imagesAvailable={imagesAvailable} />
            )}
            {issues.map((issue) => (
              <span key={issue.field} className="text-xs text-red-700 dark:text-red-400">
                {issue.message}
              </span>
            ))}
          </div>
        )}
        {!attention && row.ai?.reviewed && row.ai.confidence < 90 && (
          <div className="mt-1">
            <EditedChip label="Accepted by you" small />
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        {variants.length > 0 ? (
          <>
            {variants.map((variant) => (
              <label
                key={variant.key}
                className="flex items-center gap-1 text-xs text-muted-foreground"
              >
                {variant.name}
                <CellInput
                  aria-label={`${variant.name} price of ${label}`}
                  inputMode="decimal"
                  value={variant.price}
                  onChange={(event) =>
                    onUpdate({
                      variants: variants.map((v) =>
                        v.key === variant.key ? { ...v, price: event.target.value } : v,
                      ),
                    })
                  }
                  className="mx-0 w-16 text-right"
                />
              </label>
            ))}
            {attention && issues.length === 0 && (
              <button type="button" className={btn('default', 'sm')} onClick={() => onUpdate({})}>
                Accept <Kbd>A</Kbd>
              </button>
            )}
            <button
              type="button"
              className="h-0 overflow-hidden text-[11.5px] font-semibold text-muted-foreground opacity-0 group-focus-within:h-auto group-focus-within:opacity-100 group-hover:h-auto group-hover:opacity-100 hover:underline focus:h-auto focus:opacity-100"
              onClick={() =>
                onUpdate({ variants: [], price: variants[variants.length - 1]?.price ?? row.price })
              }
            >
              <X className="inline size-3" aria-hidden /> One price
            </button>
          </>
        ) : (
          <>
            <CellInput
              aria-label={`Price of ${label}`}
              inputMode="decimal"
              value={row.price}
              invalid={bad('price')}
              onChange={(event) => onUpdate({ price: event.target.value })}
              className="mx-0 w-20 text-right tabular-nums"
            />
            {attention && issues.length === 0 && (
              <button type="button" className={btn('default', 'sm')} onClick={() => onUpdate({})}>
                Accept <Kbd>A</Kbd>
              </button>
            )}
            <button
              type="button"
              className="h-0 overflow-hidden text-[11.5px] font-semibold text-muted-foreground opacity-0 group-focus-within:h-auto group-focus-within:opacity-100 group-hover:h-auto group-hover:opacity-100 hover:underline focus:h-auto focus:opacity-100"
              onClick={() =>
                onUpdate({
                  variants: [
                    { key: `${row.key}-half`, name: 'Half', price: '' },
                    { key: `${row.key}-full`, name: 'Full', price: row.price },
                  ],
                  price: '',
                })
              }
            >
              <Plus className="inline size-3" aria-hidden /> Half / Full
            </button>
          </>
        )}
      </div>
    </GridRow>
  );
}
