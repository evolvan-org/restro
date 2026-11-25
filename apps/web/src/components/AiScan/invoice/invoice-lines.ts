import {
  type AiJob,
  type AiJobItem,
  baseUnitOf,
  convertPack,
  invoiceScanLineSchema,
  invoiceTotalCheck,
  matchName,
  type OnboardingInvoiceDraft,
  type OnboardingInvoiceLineDraft,
  parseDecimal,
  parsePackSize,
  type Unit,
} from '@rms/api-contract';

/** An ingredient a line can be matched to (an inventory row key, or a stock item id). */
export type MatchCandidate = { key: string; name: string; baseUnit: string; aliases?: string[] };

/** Line amount ÷ base quantity, to 6 decimals (₹ per g / ml / unit). */
function unitCost(amount: number | null, base: number | null): string {
  if (amount === null || base === null || base <= 0) return '';
  return (amount / base).toFixed(6).replace(/\.?0+$/, '');
}

export function lineUnitCost(
  line: Pick<OnboardingInvoiceLineDraft, 'amount' | 'baseQuantity'>,
): string {
  return unitCost(parseDecimal(line.amount), parseDecimal(line.baseQuantity));
}

/**
 * Builds the reviewable invoice from a finished scan: header fields, and each printed line with its
 * pack size converted (5 × 1 kg → 5000 g) and its best ingredient match (or "add as new").
 */
export function invoiceFromScan(
  key: string,
  job: AiJob,
  items: readonly AiJobItem[],
  candidates: readonly MatchCandidate[],
): OnboardingInvoiceDraft {
  const header = job.invoiceHeader;
  const lines: OnboardingInvoiceLineDraft[] = items.flatMap((item) => {
    const parsed = invoiceScanLineSchema.safeParse(item.data);
    if (!parsed.success) return [];
    const line = parsed.data;
    const quantity = parseDecimal(line.quantity) ?? 0;
    const printed =
      line.packSize && line.packUnit
        ? { size: parseDecimal(line.packSize), unit: line.packUnit }
        : parsePackSize(line.rawText);
    const converted =
      printed && printed.size !== null
        ? convertPack({ quantity, packSize: printed.size, packUnit: printed.unit as Unit })
        : null;
    const [best] = matchName(`${line.description} ${line.rawText}`, candidates, {
      limit: 1,
      minScore: 60,
    });
    const baseUnit =
      converted?.baseUnit ??
      (best ? candidates.find((c) => c.key === best.key)?.baseUnit : undefined) ??
      'G';
    const baseQuantity = converted ? String(Math.round(converted.base * 1000) / 1000) : '';
    return [
      {
        key: `${job.id.slice(0, 8)}-${item.seq}`,
        rawText: line.rawText,
        description: line.description,
        ingredientKey: best?.key ?? null,
        matchScore: best?.score ?? null,
        ...(best ? {} : { newIngredientName: line.description }),
        baseQuantity,
        baseUnit,
        amount: line.amount,
        unitCost: unitCost(parseDecimal(line.amount), parseDecimal(baseQuantity)),
      },
    ];
  });
  return {
    key,
    jobId: job.id,
    supplierName: header?.supplierName ?? '',
    supplierGstin: header?.supplierGstin ?? '',
    invoiceNumber: header?.invoiceNumber ?? '',
    invoiceDate: header?.invoiceDate ?? '',
    cgst: header?.cgst ?? '',
    sgst: header?.sgst ?? '',
    igst: header?.igst ?? '',
    roundOff: header?.roundOff ?? '',
    total: header?.total ?? '',
    lines,
    applied: false,
  };
}

/** Lines + taxes + round-off = printed total (within ₹1); applying costs is blocked otherwise. */
export function checkInvoiceTotal(
  invoice: OnboardingInvoiceDraft,
): ReturnType<typeof invoiceTotalCheck> {
  return invoiceTotalCheck({
    lineAmounts: invoice.lines.map((line) => parseDecimal(line.amount) ?? 0),
    cgst: parseDecimal(invoice.cgst),
    sgst: parseDecimal(invoice.sgst),
    igst: parseDecimal(invoice.igst),
    roundOff: parseDecimal(invoice.roundOff),
    total: parseDecimal(invoice.total),
  });
}

/** Lines that would update an ingredient (matched or new, with a usable quantity and cost). */
export function applicableLines(invoice: OnboardingInvoiceDraft): OnboardingInvoiceLineDraft[] {
  return invoice.lines.filter(
    (line) =>
      !line.ignored &&
      (line.ingredientKey || line.newIngredientName?.trim()) &&
      (parseDecimal(line.baseQuantity) ?? 0) > 0 &&
      (parseDecimal(lineUnitCost(line)) ?? 0) > 0,
  );
}

export { baseUnitOf };
