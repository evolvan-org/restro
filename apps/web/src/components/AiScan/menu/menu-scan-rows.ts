import {
  type AiJobItem,
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
  findMenuRowIssues,
  menuScanRowSchema,
  type OnboardingMenuRow,
  type OnboardingRowIssue,
} from '@rms/api-contract';

/*
 * Scanned rows live as ordinary menu draft rows (with `ai` metadata), so the owner edits one list
 * whichever way it was filled. These helpers turn job items into rows and classify them for review.
 */

export function scanItemToRow(item: AiJobItem, jobId: string): OnboardingMenuRow | null {
  const parsed = menuScanRowSchema.safeParse(item.data);
  if (!parsed.success) return null;
  const row = parsed.data;
  return {
    key: `${jobId.slice(0, 8)}-${item.seq}`,
    category: row.category,
    type: row.type,
    name: row.name,
    price: row.price ?? '',
    description: row.description ?? '',
    available: true,
    dietType: row.dietType,
    variants: row.variants.map((variant, index) => ({
      key: `${item.seq}-v${index}`,
      name: variant.name,
      price: variant.price,
    })),
    ...(row.originalName && { originalName: row.originalName }),
    ai: {
      jobId,
      seq: item.seq,
      confidence: row.confidence,
      issues: row.issues,
      rawText: row.rawText,
      source: row.source,
      flag: row.flag,
      flagNote: row.flagNote,
      reviewed: false,
    },
    // Headers, taglines and likely duplicates start out left out; the owner can keep them.
    excluded: row.flag !== 'dish',
  };
}

/** Appends rows for job items the draft doesn't have yet (idempotent by job + seq). */
export function mergeScanItems(
  rows: readonly OnboardingMenuRow[],
  items: readonly AiJobItem[],
  jobId: string,
): OnboardingMenuRow[] | null {
  const have = new Set(rows.filter((row) => row.ai?.jobId === jobId).map((row) => row.ai!.seq));
  const fresh = items
    .filter((item) => !have.has(item.seq))
    .map((item) => scanItemToRow(item, jobId))
    .filter((row): row is OnboardingMenuRow => row !== null);
  return fresh.length ? [...rows, ...fresh] : null;
}

export type ReviewGroup = 'attention' | 'ready' | 'out';

export function isLowConfidence(row: OnboardingMenuRow): boolean {
  return Boolean(
    row.ai &&
    !row.ai.reviewed &&
    (row.ai.confidence < CONFIDENCE_MEDIUM || row.ai.issues.length > 0),
  );
}

export function isHighConfidence(row: OnboardingMenuRow): boolean {
  return Boolean(row.ai && row.ai.confidence >= CONFIDENCE_HIGH && row.ai.issues.length === 0);
}

export type MenuReview = {
  groups: Map<string, ReviewGroup>;
  issuesByKey: Map<string, OnboardingRowIssue[]>;
  ready: number;
  attention: number;
  out: number;
  duplicates: number;
  notDishes: number;
  highConfidenceUnreviewed: number;
};

/** Problems first: validation errors and unreviewed low-confidence rows need attention. */
export function reviewMenuRows(rows: readonly OnboardingMenuRow[]): MenuReview {
  const issues = findMenuRowIssues(rows);
  const issuesByKey = new Map<string, OnboardingRowIssue[]>();
  for (const issue of issues) {
    const key = rows[issue.index]?.key;
    if (key) issuesByKey.set(key, [...(issuesByKey.get(key) ?? []), issue]);
  }
  const groups = new Map<string, ReviewGroup>();
  const summary = {
    ready: 0,
    attention: 0,
    out: 0,
    duplicates: 0,
    notDishes: 0,
    highConfidenceUnreviewed: 0,
  };
  for (const row of rows) {
    let group: ReviewGroup;
    if (row.excluded) group = 'out';
    else if (issuesByKey.has(row.key) || isLowConfidence(row)) group = 'attention';
    else group = 'ready';
    groups.set(row.key, group);
    summary[group] += 1;
    if (row.ai?.flag === 'duplicate') summary.duplicates += 1;
    if (row.ai?.flag === 'not_a_dish') summary.notDishes += 1;
    if (group === 'ready' && row.ai && !row.ai.reviewed && isHighConfidence(row)) {
      summary.highConfidenceUnreviewed += 1;
    }
  }
  return { groups, issuesByKey, ...summary };
}

export function markReviewed(row: OnboardingMenuRow): OnboardingMenuRow {
  return row.ai ? { ...row, ai: { ...row.ai, reviewed: true } } : row;
}
