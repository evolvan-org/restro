import {
  type InvoiceScanHeader,
  invoiceScanHeaderSchema,
  type InvoiceScanLine,
  invoiceScanLineSchema,
  type MenuScanRow,
  menuScanRowSchema,
  type SourceBox,
} from '@rms/api-contract';

/*
 * Maps raw model output to contract rows. Nothing is guessed into shape: values are only trimmed,
 * clamped and normalised; anything still invalid is dropped (and counted) by the caller.
 */

type Raw = Record<string, unknown>;

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/** "₹ 1,250.00" → "1250.00"; anything that isn't a plain number → null. */
export function decimalOrNull(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[₹,\s]|rs\.?|inr/gi, '');
  return /^-?\d{1,12}(?:\.\d{1,3})?$/.test(cleaned) ? cleaned : null;
}

const confidence = (value: unknown): number =>
  Math.max(
    0,
    Math.min(100, Math.round(typeof value === 'number' && Number.isFinite(value) ? value : 50)),
  );

/** Gemini `[ymin, xmin, ymax, xmax]` (0–1000) → a normalised box on `page`. */
export function boxFromModel(value: unknown, page: number): SourceBox | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const [ymin, xmin, ymax, xmax] = value.map(Number);
  if ([ymin, xmin, ymax, xmax].some((n) => n === undefined || !Number.isFinite(n))) return null;
  const clampMille = (value: number): number => Math.max(0, Math.min(1000, value));
  const x = clampMille(xmin!) / 1000;
  const y = clampMille(ymin!) / 1000;
  const w = (clampMille(xmax!) - clampMille(xmin!)) / 1000;
  const h = (clampMille(ymax!) - clampMille(ymin!)) / 1000;
  if (w <= 0 || h <= 0) return null;
  return { page, x, y, w, h };
}

const DIETS = new Set(['VEG', 'NON_VEG', 'EGG']);

export function mapMenuRow(
  raw: Raw,
  page: number,
  dishKeyOf: (name: string) => string,
  seen: Map<string, string>,
): MenuScanRow | null {
  const name = text(raw.name, 255);
  if (!name) return null;
  const kind = raw.kind === 'header' || raw.kind === 'note' ? raw.kind : 'dish';
  const issues = Array.isArray(raw.issues)
    ? raw.issues.flatMap((issue) => text(issue, 200) ?? []).slice(0, 5)
    : [];
  const variants = Array.isArray(raw.variants)
    ? raw.variants.flatMap((variant: unknown) => {
        const v = (variant ?? {}) as Raw;
        const variantName = text(v.name, 50);
        const price = decimalOrNull(v.price);
        return variantName && price && Number(price) >= 0 ? [{ name: variantName, price }] : [];
      })
    : [];
  const price = decimalOrNull(raw.price);
  let rowConfidence = confidence(raw.confidence);
  if (kind === 'dish' && price === null && variants.length < 2) {
    issues.push('No price found on the menu. Enter the price.');
    rowConfidence = Math.min(rowConfidence, 60);
  }

  let flag: MenuScanRow['flag'] = 'dish';
  let flagNote: string | null = null;
  if (kind === 'header') {
    flag = 'not_a_dish';
    flagNote = 'Looks like a section header.';
  } else if (kind === 'note') {
    flag = 'not_a_dish';
    flagNote = 'Looks like a note or tagline, not a dish.';
  } else {
    const key = dishKeyOf(name);
    const first = seen.get(key);
    if (first) {
      flag = 'duplicate';
      flagNote = `Looks the same as ${first}.`;
    } else if (key) {
      seen.set(key, name);
    }
  }

  const type = raw.type === 'BAR' ? 'BAR' : 'FOOD';
  const parsed = menuScanRowSchema.safeParse({
    category: text(raw.category, 150) ?? '',
    type,
    name,
    originalName: text(raw.originalName, 255),
    dietType: typeof raw.diet === 'string' && DIETS.has(raw.diet) ? raw.diet : null,
    price: variants.length >= 2 ? null : price,
    variants: variants.length >= 2 ? variants.slice(0, 6) : [],
    description: text(raw.description, 255),
    confidence: rowConfidence,
    issues: issues.slice(0, 5),
    rawText: text(raw.rawText, 300),
    source: boxFromModel(raw.box, page),
    flag,
    flagNote,
  });
  return parsed.success ? parsed.data : null;
}

const UNITS = new Set(['G', 'KG', 'ML', 'L', 'UNIT']);

export function mapInvoiceLine(raw: Raw, page: number): InvoiceScanLine | null {
  const date = text(raw.expiryDate, 10);
  const parsed = invoiceScanLineSchema.safeParse({
    rawText: text(raw.rawText, 300) ?? text(raw.description, 300) ?? '',
    description: text(raw.description, 200) ?? '',
    hsn: text(raw.hsn, 12),
    quantity: decimalOrNull(raw.quantity),
    packSize: decimalOrNull(raw.packSize),
    packUnit: typeof raw.packUnit === 'string' && UNITS.has(raw.packUnit) ? raw.packUnit : null,
    unitRate: decimalOrNull(raw.unitRate),
    amount: decimalOrNull(raw.amount),
    batchNumber: text(raw.batchNumber, 80),
    expiryDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    confidence: confidence(raw.confidence),
    source: boxFromModel(raw.box, page),
  });
  return parsed.success && parsed.data.description ? parsed.data : null;
}

/** Fills header fields still missing from what this page printed. */
export function mergeInvoiceHeader(
  current: InvoiceScanHeader | null,
  raw: unknown,
): InvoiceScanHeader | null {
  if (!raw || typeof raw !== 'object') return current;
  const value = raw as Raw;
  const gstin = text(value.supplierGstin, 15)?.toUpperCase().replace(/\s/g, '') ?? null;
  const date = text(value.invoiceDate, 10);
  const candidate = {
    supplierName: text(value.supplierName, 150),
    supplierGstin: gstin,
    invoiceNumber: text(value.invoiceNumber, 50),
    invoiceDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    subtotal: decimalOrNull(value.subtotal),
    cgst: decimalOrNull(value.cgst),
    sgst: decimalOrNull(value.sgst),
    igst: decimalOrNull(value.igst),
    roundOff: decimalOrNull(value.roundOff),
    total: decimalOrNull(value.total),
    confidence: confidence(value.confidence),
  };
  const merged = current
    ? {
        ...candidate,
        ...Object.fromEntries(
          Object.entries(current).filter(
            ([key, existing]) => key !== 'confidence' && existing !== null,
          ),
        ),
        confidence: Math.min(current.confidence, candidate.confidence),
      }
    : candidate;
  const parsed = invoiceScanHeaderSchema.safeParse(merged);
  return parsed.success ? parsed.data : current;
}
