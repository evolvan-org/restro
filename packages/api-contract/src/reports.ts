import { z } from 'zod';

export const REPORT_DEFAULT_DAYS = 7;
export const REPORT_MAX_DAYS = 92;

const MILLISECONDS_PER_DAY = 86_400_000;
const reportDateSchema = z
  .string({ required_error: 'Choose a date' })
  .regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/, 'Enter a date in YYYY-MM-DD format')
  .date('Enter a valid date');
const moneySchema = z.string().regex(/^-?\d+\.\d{2}$/);

const reportDateRangeFields = z.object({ from: reportDateSchema, to: reportDateSchema }).strict();

export const reportDateRangeSchema = reportDateRangeFields.superRefine(validateRangeLength);

function validateRangeLength({ from, to }: ReportDateRange, context: z.RefinementCtx): void {
  const elapsedDays =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MILLISECONDS_PER_DAY;

  if (elapsedDays < 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to'],
      message: 'End date must be on or after the start date',
    });
  } else if (elapsedDays >= REPORT_MAX_DAYS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to'],
      message: `Choose a range of ${REPORT_MAX_DAYS} days or fewer`,
    });
  }
}

export const reportDateRangeParamsSchema = z
  .object({
    from: reportDateSchema
      .optional()
      .describe(
        'Inclusive restaurant-local start date (YYYY-MM-DD). Supply both dates or omit both.',
      ),
    to: reportDateSchema
      .optional()
      .describe(
        `Inclusive restaurant-local end date (YYYY-MM-DD). Maximum ${REPORT_MAX_DAYS} calendar days including both endpoints.`,
      ),
  })
  .strict();

export const reportDateRangeQuerySchema = reportDateRangeParamsSchema.superRefine(
  ({ from, to }, context) => {
    if (from === undefined && to === undefined) return;
    if (from === undefined || to === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [from === undefined ? 'from' : 'to'],
        message: 'Supply both dates or omit both to use the default range',
      });
      return;
    }
    validateRangeLength({ from, to }, context);
  },
);

const salesTotalsSchema = z
  .object({ revenue: moneySchema, orders: z.number().int().nonnegative() })
  .strict();
const gstTotalsSchema = z.object({ taxableValue: moneySchema, gstCollected: moneySchema }).strict();
const reportMetadata = { range: reportDateRangeFields, currency: z.string().length(3) };

export const dailySalesReportSchema = z
  .object({
    ...reportMetadata,
    rows: z.array(salesTotalsSchema.extend({ date: reportDateSchema })),
    total: salesTotalsSchema,
  })
  .strict();

export const gstReportSchema = z
  .object({
    ...reportMetadata,
    rows: z.array(gstTotalsSchema.extend({ date: reportDateSchema })),
    total: gstTotalsSchema,
  })
  .strict();

export type ReportDateRange = z.infer<typeof reportDateRangeFields>;
export type ReportDateRangeQuery = z.infer<typeof reportDateRangeQuerySchema>;
export type DailySalesReport = z.infer<typeof dailySalesReportSchema>;
export type GstReport = z.infer<typeof gstReportSchema>;
