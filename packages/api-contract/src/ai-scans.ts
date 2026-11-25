import { z } from 'zod';

import { errorResponseSchema } from './common';
import { inventoryBaseUnitSchema } from './inventory';
import { dietTypeSchema } from './menu-items';
import { servingTypeSchema } from './serving-types';
import { unitSchema } from './stock-items';

/*
 * AI assistance (REST-89): menu photo scan, supplier invoice scan and recipe drafting.
 * Core principle: the AI drafts, the owner decides. Everything here only feeds a draft the owner
 * reviews; low-confidence values are flagged, never applied silently.
 */

// ---------------------------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------------------------

export const AI_JOB_KINDS = ['MENU_SCAN', 'INVOICE_SCAN', 'RECIPE_DRAFT'] as const;
export const aiJobKindSchema = z.enum(AI_JOB_KINDS);
export const aiJobStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
]);
export const aiJobContextSchema = z.enum(['ONBOARDING', 'POST_ONBOARDING']);
export const ACTIVE_AI_JOB_STATUSES = ['QUEUED', 'RUNNING'] as const satisfies AiJobStatus[];

/** Why a job (or one page) failed; each maps to a failure state with a way forward. */
export const aiJobErrorCodeSchema = z.enum([
  'UNREADABLE',
  'NOT_A_MENU',
  'NOT_AN_INVOICE',
  'AI_UNAVAILABLE',
  'INVALID_OUTPUT',
  'CANCELLED',
  'INTERRUPTED',
]);

export const SCAN_MIN_PAGES = 1;
export const SCAN_MAX_PAGES = 8;
export const SCAN_MAX_PAGE_BYTES = 6 * 1024 * 1024;
export const SCAN_ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Confidence bands: always shown as icon + number, never colour alone. */
export const CONFIDENCE_HIGH = 90;
export const CONFIDENCE_MEDIUM = 75;
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= CONFIDENCE_HIGH) return 'high';
  if (confidence >= CONFIDENCE_MEDIUM) return 'medium';
  return 'low';
}

const confidence = z.number().int().min(0).max(100);
const decimalText = z.string().regex(/^-?\d{1,12}(?:\.\d{1,3})?$/, 'Expected a decimal number');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Region of a page image, normalised to 0–1 so it scales with the displayed photo. */
export const sourceBoxSchema = z
  .object({
    page: z.number().int().min(1),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
  })
  .strict();

export const scanPageStatusSchema = z.enum([
  'pending',
  'reading',
  'done',
  'unreadable',
  'not_document',
  'failed',
]);
export const scanPageQualitySchema = z.enum(['ok', 'blurry', 'cropped', 'dark']);

export const scanPageResultSchema = z
  .object({
    page: z.number().int().min(1),
    status: scanPageStatusSchema,
    quality: scanPageQualitySchema.nullable(),
    itemCount: z.number().int().nonnegative(),
    /** Section heading the page seems to hold, e.g. "Starters". */
    title: z.string().nullable(),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// Extracted rows (what a job item's `data` holds, per kind)
// ---------------------------------------------------------------------------------------------

export const menuScanVariantSchema = z
  .object({ name: z.string().min(1).max(50), price: decimalText })
  .strict();

export const menuScanRowFlagSchema = z.enum(['dish', 'not_a_dish', 'duplicate']);

export const menuScanRowSchema = z
  .object({
    category: z.string().max(150),
    type: servingTypeSchema,
    /** Cleaned-up English name. */
    name: z.string().min(1).max(255),
    /** As printed, when it differs (Hindi, regional script or mixed). */
    originalName: z.string().max(255).nullable(),
    dietType: dietTypeSchema.nullable(),
    /** Single price; null when the dish only has portion prices. */
    price: decimalText.nullable(),
    variants: z.array(menuScanVariantSchema).max(6),
    description: z.string().max(255).nullable(),
    confidence,
    /** Plain-language reasons a field needs checking, e.g. `Price read as "2Z0"`. */
    issues: z.array(z.string().max(200)).max(5),
    /** The printed line as read, shown as the source snippet. */
    rawText: z.string().max(300).nullable(),
    source: sourceBoxSchema.nullable(),
    flag: menuScanRowFlagSchema,
    flagNote: z.string().max(200).nullable(),
  })
  .strict();

export const invoiceScanHeaderSchema = z
  .object({
    supplierName: z.string().max(150).nullable(),
    supplierGstin: z.string().max(15).nullable(),
    invoiceNumber: z.string().max(50).nullable(),
    invoiceDate: isoDate.nullable(),
    subtotal: decimalText.nullable(),
    cgst: decimalText.nullable(),
    sgst: decimalText.nullable(),
    igst: decimalText.nullable(),
    roundOff: decimalText.nullable(),
    total: decimalText.nullable(),
    confidence,
  })
  .strict();

export const invoiceScanLineSchema = z
  .object({
    /** As printed: "AMUL PANEER 1KG ×5". */
    rawText: z.string().max(300),
    description: z.string().max(200),
    hsn: z.string().max(12).nullable(),
    /** Number of packs (or units) bought. */
    quantity: decimalText,
    /** Size of one pack, when printed (1 for "1KG"). */
    packSize: decimalText.nullable(),
    packUnit: unitSchema.nullable(),
    unitRate: decimalText.nullable(),
    amount: decimalText,
    batchNumber: z.string().max(80).nullable(),
    expiryDate: isoDate.nullable(),
    confidence,
    source: sourceBoxSchema.nullable(),
  })
  .strict();

export const recipeDraftLineSchema = z
  .object({
    ingredient: z.string().min(1).max(150),
    quantity: decimalText,
    unit: unitSchema,
    confidence,
  })
  .strict();

export const recipeDraftSchema = z
  .object({
    /** The client's key for the dish (menu row key or menu item id). */
    dishRef: z.string().min(1).max(64),
    dishName: z.string().max(255),
    lines: z.array(recipeDraftLineSchema).max(30),
    note: z.string().max(500).nullable(),
    /** Bought-in items (bottled drinks) need no recipe. */
    noRecipeNeeded: z.boolean(),
    fromCache: z.boolean(),
    confidence,
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------------------------

export const aiJobSchema = z
  .object({
    id: z.string().uuid(),
    kind: aiJobKindSchema,
    status: aiJobStatusSchema,
    context: aiJobContextSchema,
    pagesTotal: z.number().int().nonnegative(),
    pagesDone: z.number().int().nonnegative(),
    itemCount: z.number().int().nonnegative(),
    errorCode: aiJobErrorCodeSchema.nullable(),
    pages: z.array(scanPageResultSchema),
    invoiceHeader: invoiceScanHeaderSchema.nullable(),
    /** Rows the model returned that failed validation (never guessed into shape). */
    droppedRows: z.number().int().nonnegative(),
    /** False once the photos were deleted from the server. */
    imagesAvailable: z.boolean(),
    createdAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
  })
  .strict();

export const aiJobItemSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    page: z.number().int().min(1).nullable(),
    confidence,
    /** A `menuScanRowSchema`, `invoiceScanLineSchema` or `recipeDraftSchema`, by job kind. */
    data: z.record(z.unknown()),
  })
  .strict();

export const aiJobItemsQuerySchema = z
  .object({ afterSeq: z.coerce.number().int().min(-1).default(-1) })
  .strict();

export const aiJobDetailResponseSchema = z
  .object({ job: aiJobSchema, items: z.array(aiJobItemSchema) })
  .strict();

// ---------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------

/** Multipart fields that accompany the page files of a scan upload. */
export const createScanFieldsSchema = z
  .object({
    context: aiJobContextSchema,
    /** JSON array, one entry per uploaded page (`pages` files), in page order. */
    pageInfo: z
      .string()
      .transform((value, ctx) => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pageInfo must be JSON' });
          return z.NEVER;
        }
      })
      .pipe(
        z
          .array(
            z
              .object({
                width: z.number().int().positive().max(10000),
                height: z.number().int().positive().max(10000),
                /** Client-side sharpness score (higher = sharper); informational. */
                sharpness: z.number().nonnegative().optional(),
              })
              .strict(),
          )
          .min(SCAN_MIN_PAGES)
          .max(SCAN_MAX_PAGES),
      ),
  })
  .strict();

export const portionStyleSchema = z.enum(['LIGHT', 'STANDARD', 'GENEROUS']);
export const PORTION_STYLE_LABELS: Record<PortionStyle, string> = {
  LIGHT: 'Light',
  STANDARD: 'Standard',
  GENEROUS: 'Generous',
};

export const RECIPE_DRAFT_MAX_DISHES = 500;
export const createRecipeDraftRequestSchema = z
  .object({
    context: aiJobContextSchema,
    portionStyle: portionStyleSchema,
    dishes: z
      .array(
        z
          .object({
            ref: z.string().min(1).max(64),
            name: z.string().trim().min(1).max(255),
            category: z.string().trim().max(150),
            type: servingTypeSchema,
            dietType: dietTypeSchema.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(RECIPE_DRAFT_MAX_DISHES),
  })
  .strict();

/** Estimated market prices for ingredient names (catalog first, model for unknowns). */
export const ingredientPriceLookupRequestSchema = z
  .object({ names: z.array(z.string().trim().min(1).max(150)).min(1).max(300) })
  .strict();

export const ingredientPriceSourceSchema = z.enum(['catalog', 'ai', 'none']);
export const ingredientPriceEstimateSchema = z
  .object({
    name: z.string(),
    /** Catalog name it matched, so "Dahi" and "Curd" resolve to one ingredient. */
    canonicalName: z.string().nullable(),
    baseUnit: inventoryBaseUnitSchema,
    /** Estimated ₹ per base unit (g, ml or unit) as a decimal string; null when unknown. */
    pricePerBase: z.string().nullable(),
    source: ingredientPriceSourceSchema,
    aliases: z.array(z.string()),
  })
  .strict();
export const ingredientPriceLookupResponseSchema = z
  .object({ items: z.array(ingredientPriceEstimateSchema) })
  .strict();

// ---------------------------------------------------------------------------------------------
// Usage, realtime and errors
// ---------------------------------------------------------------------------------------------

export const aiUsageResponseSchema = z
  .object({
    /** False when no provider is configured: the UI offers CSV / manual instead. */
    enabled: z.boolean(),
    menuScans: z.object({ used: z.number().int(), limit: z.number().int() }).strict(),
    invoiceScans: z.object({ used: z.number().int(), limit: z.number().int() }).strict(),
  })
  .strict();

export const AI_JOB_EVENT = 'ai-job.updated';
/** One Pusher event per new row or status change (well under Pusher's 10 KB limit). */
export const aiJobEventSchema = z
  .object({
    jobId: z.string().uuid(),
    status: aiJobStatusSchema,
    pagesDone: z.number().int().nonnegative(),
    pagesTotal: z.number().int().nonnegative(),
    item: aiJobItemSchema.nullable(),
  })
  .strict();

export const aiRealtimeConfigSchema = z
  .object({ key: z.string(), cluster: z.string(), channel: z.string() })
  .strict();

export const aiQuotaErrorSchema = errorResponseSchema
  .extend({
    statusCode: z.literal(429),
    code: z.literal('AI_QUOTA_EXCEEDED'),
    limit: z.number().int(),
    used: z.number().int(),
  })
  .strict();

export const aiUnavailableErrorSchema = errorResponseSchema
  .extend({ statusCode: z.literal(503), code: z.literal('AI_UNAVAILABLE') })
  .strict();

export type AiJobKind = z.infer<typeof aiJobKindSchema>;
export type AiJobStatus = z.infer<typeof aiJobStatusSchema>;
export type AiJobContext = z.infer<typeof aiJobContextSchema>;
export type AiJobErrorCode = z.infer<typeof aiJobErrorCodeSchema>;
export type SourceBox = z.infer<typeof sourceBoxSchema>;
export type ScanPageStatus = z.infer<typeof scanPageStatusSchema>;
export type ScanPageQuality = z.infer<typeof scanPageQualitySchema>;
export type ScanPageResult = z.infer<typeof scanPageResultSchema>;
export type MenuScanVariant = z.infer<typeof menuScanVariantSchema>;
export type MenuScanRow = z.infer<typeof menuScanRowSchema>;
export type InvoiceScanHeader = z.infer<typeof invoiceScanHeaderSchema>;
export type InvoiceScanLine = z.infer<typeof invoiceScanLineSchema>;
export type RecipeDraftLine = z.infer<typeof recipeDraftLineSchema>;
export type RecipeDraft = z.infer<typeof recipeDraftSchema>;
export type AiJob = z.infer<typeof aiJobSchema>;
export type AiJobItem = z.infer<typeof aiJobItemSchema>;
export type AiJobItemsQuery = z.infer<typeof aiJobItemsQuerySchema>;
export type AiJobDetailResponse = z.infer<typeof aiJobDetailResponseSchema>;
export type CreateScanFields = z.output<typeof createScanFieldsSchema>;
export type PortionStyle = z.infer<typeof portionStyleSchema>;
export type CreateRecipeDraftRequest = z.infer<typeof createRecipeDraftRequestSchema>;
export type IngredientPriceLookupRequest = z.infer<typeof ingredientPriceLookupRequestSchema>;
export type IngredientPriceEstimate = z.infer<typeof ingredientPriceEstimateSchema>;
export type IngredientPriceLookupResponse = z.infer<typeof ingredientPriceLookupResponseSchema>;
export type AiUsageResponse = z.infer<typeof aiUsageResponseSchema>;
export type AiJobEvent = z.infer<typeof aiJobEventSchema>;
export type AiRealtimeConfig = z.infer<typeof aiRealtimeConfigSchema>;
export type AiQuotaError = z.infer<typeof aiQuotaErrorSchema>;
