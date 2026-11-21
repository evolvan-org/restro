import { z } from 'zod';

import { onboardingStateSchema } from './auth';
import { errorResponseSchema } from './common';
import { inventoryBaseUnitSchema } from './inventory';
import { MAX_MENU_ITEM_PRICE, menuItemPriceSchema } from './menu-items';
import { restaurantSettingsSchema } from './restaurant-settings';
import { servingTypeSchema } from './serving-types';
import { userEmailSchema, userNameSchema } from './user-fields';

/*
 * Owner onboarding: a draft the owner fills in step by step (validated loosely, saved as they go)
 * and a strict validation of the same shape when they finish. The issue finders below are shared by
 * the API (CSV preview, finish) and the web app (inline errors), so both always agree on validity.
 */

// ---------------------------------------------------------------------------------------------
// Steps, stages and limits
// ---------------------------------------------------------------------------------------------

export const ONBOARDING_STEPS = [
  'details',
  'floor',
  'menu',
  'inventory',
  'team',
  'review',
] as const;
export const onboardingStepSchema = z.enum(ONBOARDING_STEPS);
export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

/** Every step but review can be skipped; a skipped step's data is ignored at finish. */
export const SKIPPABLE_ONBOARDING_STEPS = [
  'details',
  'floor',
  'menu',
  'inventory',
  'team',
] as const satisfies readonly OnboardingStep[];
export const skippableOnboardingStepSchema = z.enum(SKIPPABLE_ONBOARDING_STEPS);
export type SkippableOnboardingStep = z.infer<typeof skippableOnboardingStepSchema>;

/** Phases of `POST /onboarding/complete`, in the order they run; a failure names one. */
export const ONBOARDING_STAGES = [
  'details',
  'floor',
  'statuses',
  'menu',
  'inventory',
  'team',
  'final',
] as const;
export const onboardingStageSchema = z.enum(ONBOARDING_STAGES);
export type OnboardingStage = z.infer<typeof onboardingStageSchema>;

/** Where the owner goes to fix a failed stage. */
export const ONBOARDING_STAGE_STEP: Record<OnboardingStage, OnboardingStep> = {
  details: 'details',
  floor: 'floor',
  statuses: 'floor',
  menu: 'menu',
  inventory: 'inventory',
  team: 'team',
  final: 'review',
};

export const ONBOARDING_MAX_SECTIONS = 50;
export const ONBOARDING_MAX_TABLES_PER_SECTION = 200;
export const ONBOARDING_MAX_TABLE_CAPACITY = 50;
export const ONBOARDING_MAX_CUSTOM_STATUSES = 20;
export const ONBOARDING_MAX_CANCELLATION_REASONS = 30;
export const ONBOARDING_MENU_MAX_ROWS = 500;
export const ONBOARDING_MENU_CSV_MAX_BYTES = 512 * 1024;
export const ONBOARDING_INVENTORY_MAX_ROWS = 200;
export const ONBOARDING_TEAM_MAX_MEMBERS = 20;
export const ONBOARDING_GST_RATES = [0, 5, 12, 18, 28] as const;

/** Canonical GSTIN: 2-digit state code, PAN, entity number, `Z`, checksum. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const MENU_CSV_COLUMNS = [
  'category',
  'type',
  'name',
  'price',
  'description',
  'available',
] as const;
export const MENU_CSV_REQUIRED_COLUMNS = ['category', 'type', 'name', 'price'] as const;

/** Roles the owner can give a team member during setup. */
export const ONBOARDING_TEAM_ROLES = [
  'MANAGER',
  'CAPTAIN',
  'RECEPTION',
  'KITCHEN_STAFF',
  'BAR_STAFF',
] as const;
export const onboardingTeamRoleSchema = z.enum(ONBOARDING_TEAM_ROLES, {
  errorMap: () => ({ message: 'Choose a role' }),
});

/** Table status codes the floor and billing code depend on; custom statuses cannot reuse them. */
export const SYSTEM_TABLE_STATUS_CODES = [
  'AVAILABLE',
  'RESERVED',
  'OCCUPIED',
  'NEEDS_CLEANING',
] as const;

/** The cancellation reasons every restaurant starts with (mirrors the signup defaults). */
export const BILL_CANCELLATION_REASON_DEFAULTS = [
  { code: 'GUEST_REQUEST', name: 'Guest request' },
  { code: 'DUPLICATE_BILL', name: 'Duplicate bill' },
  { code: 'BILLING_ERROR', name: 'Billing error' },
  { code: 'ORDER_CHANGED', name: 'Order changed' },
  { code: 'OTHER', name: 'Other' },
] as const;

/** Derives a status code from its display name, e.g. "Deep clean" → `DEEP_CLEAN`. */
export function tableStatusCodeFromName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

// ---------------------------------------------------------------------------------------------
// Draft: the loose shape saved while the owner types. Form values stay as entered (strings), so
// a half-filled step round-trips intact; only structure and sizes are enforced here.
// ---------------------------------------------------------------------------------------------

/** Drafts keep what was typed or uploaded, even when too long; finish reports the real limits. */
const DRAFT_TEXT_MAX = 1000;
const draftText = z.string().max(DRAFT_TEXT_MAX);
const rowKey = z.string().min(1).max(64);

export const onboardingDetailsDraftSchema = z
  .object({
    name: draftText,
    address: draftText,
    gstNumber: draftText,
    defaultGstRate: z.number().min(0).max(100),
    maxDiscountPercent: draftText,
    currency: draftText,
    timezone: draftText,
  })
  .strict();

export const onboardingTableDraftSchema = z
  .object({ key: rowKey, number: draftText, capacity: draftText })
  .strict();

export const onboardingSectionDraftSchema = z
  .object({
    key: rowKey,
    name: draftText,
    prefix: draftText,
    tables: z.array(onboardingTableDraftSchema).max(ONBOARDING_MAX_TABLES_PER_SECTION),
  })
  .strict();

export const onboardingCancellationReasonDraftSchema = z
  .object({
    key: rowKey,
    /** Set for the defaults seeded at signup, so finishing renames them instead of adding more. */
    code: z.string().max(50).optional(),
    name: draftText,
  })
  .strict();

export const onboardingFloorDraftSchema = z
  .object({
    sections: z.array(onboardingSectionDraftSchema).max(ONBOARDING_MAX_SECTIONS),
    customStatuses: z
      .array(z.object({ key: rowKey, name: draftText }).strict())
      .max(ONBOARDING_MAX_CUSTOM_STATUSES),
    /** Undefined until the owner edits the list: the signup defaults are kept as they are. */
    cancellationReasons: z
      .array(onboardingCancellationReasonDraftSchema)
      .max(ONBOARDING_MAX_CANCELLATION_REASONS)
      .optional(),
  })
  .strict();

export const onboardingMenuRowSchema = z
  .object({
    key: rowKey,
    /** Source CSV line, kept so error messages point back at the spreadsheet. */
    line: z.number().int().positive().optional(),
    category: draftText,
    type: draftText,
    name: draftText,
    price: draftText,
    description: draftText,
    available: z.boolean(),
  })
  .strict();

export const onboardingMenuDraftSchema = z
  .object({
    mode: z.enum(['csv', 'manual', 'later']),
    fileName: z.string().max(255).optional(),
    rows: z.array(onboardingMenuRowSchema).max(ONBOARDING_MENU_MAX_ROWS),
  })
  .strict();

export const onboardingInventoryRowSchema = z
  .object({
    key: rowKey,
    line: z.number().int().positive().optional(),
    name: draftText,
    sku: draftText,
    baseUnit: draftText,
    reorderLevel: draftText,
    openingQuantity: draftText,
    openingUnitCost: draftText,
  })
  .strict();

export const onboardingInventoryDraftSchema = z
  .object({
    fileName: z.string().max(255).optional(),
    rows: z.array(onboardingInventoryRowSchema).max(ONBOARDING_INVENTORY_MAX_ROWS),
  })
  .strict();

export const onboardingTeamMemberDraftSchema = z
  .object({ key: rowKey, name: draftText, email: draftText, role: draftText })
  .strict();

export const onboardingTeamDraftSchema = z
  .object({ members: z.array(onboardingTeamMemberDraftSchema).max(ONBOARDING_TEAM_MAX_MEMBERS) })
  .strict();

export const onboardingDraftDataSchema = z
  .object({
    details: onboardingDetailsDraftSchema.optional(),
    floor: onboardingFloorDraftSchema.optional(),
    menu: onboardingMenuDraftSchema.optional(),
    inventory: onboardingInventoryDraftSchema.optional(),
    team: onboardingTeamDraftSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// Row issue finders (shared by preview, finish and inline validation)
// ---------------------------------------------------------------------------------------------

export const onboardingRowIssueSchema = z
  .object({
    /** Index into the submitted rows. */
    index: z.number().int().nonnegative(),
    line: z.number().int().positive().optional(),
    field: z.string(),
    message: z.string(),
  })
  .strict();

const normalized = (value: string): string => value.trim().toLowerCase();

/** The first schema issue for each field of one row (a blank price shouldn't report twice). */
function schemaIssues(
  schema: z.ZodTypeAny,
  row: { line?: number },
  index: number,
): OnboardingRowIssue[] {
  const parsed = schema.safeParse(row);
  if (parsed.success) return [];
  const byField = new Map<string, OnboardingRowIssue>();
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? 'row');
    if (!byField.has(field))
      byField.set(field, { index, line: row.line, field, message: issue.message });
  }
  return [...byField.values()];
}

const quantityPattern = /^\d{1,9}(?:\.\d{1,3})?$/;
const costPattern = /^\d{1,10}(?:\.\d{1,8})?$/;

export const onboardingMenuItemSchema = z
  .object({
    category: z
      .string()
      .trim()
      .min(1, 'Category is required')
      .max(150, 'Category must be 150 characters or fewer'),
    type: z.string().trim().toUpperCase().pipe(servingTypeSchema),
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(255, 'Name must be 255 characters or fewer'),
    price: menuItemPriceSchema,
    description: z
      .string()
      .trim()
      .max(255, 'Description must be 255 characters or fewer')
      .transform((value) => value || null),
    available: z.boolean(),
  })
  .describe(`Price is a decimal string up to ${MAX_MENU_ITEM_PRICE}`);

/** Every problem with the menu rows, including the same name twice in one category. */
export function findMenuRowIssues(rows: readonly OnboardingMenuRow[]): OnboardingRowIssue[] {
  const issues: OnboardingRowIssue[] = [];
  const seen = new Map<string, number>();
  rows.forEach((row, index) => {
    issues.push(...schemaIssues(onboardingMenuItemSchema, row, index));
    if (!row.name.trim() || !row.category.trim()) return;
    const key = `${normalized(row.category)}\u0000${normalized(row.name)}`;
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, index);
      return;
    }
    const firstRow = rows[first];
    issues.push({
      index,
      line: row.line,
      field: 'name',
      message: `Same name as ${firstRow?.line ? `row ${firstRow.line}` : 'another item'} in ${row.category.trim()}`,
    });
  });
  return issues;
}

export const onboardingMenuCategorySummarySchema = z
  .object({
    name: z.string(),
    type: servingTypeSchema,
    itemCount: z.number().int().nonnegative(),
    /** The category holds both FOOD and BAR items; each item's own type still drives routing. */
    mixedTypes: z.boolean(),
  })
  .strict();

/**
 * Categories created at finish, in first-seen order. A category is FOOD if any of its items is
 * FOOD, otherwise BAR. Rows with an unusable category or type are left out.
 */
export function summarizeMenuCategories(
  rows: readonly OnboardingMenuRow[],
): OnboardingMenuCategorySummary[] {
  const byName = new Map<string, OnboardingMenuCategorySummary & { types: Set<string> }>();
  for (const row of rows) {
    const name = row.category.trim();
    const type = row.type.trim().toUpperCase();
    if (!name || (type !== 'FOOD' && type !== 'BAR')) continue;
    const entry = byName.get(normalized(name)) ?? {
      name,
      type: 'BAR' as const,
      itemCount: 0,
      mixedTypes: false,
      types: new Set<string>(),
    };
    entry.itemCount += 1;
    entry.types.add(type);
    if (type === 'FOOD') entry.type = 'FOOD';
    entry.mixedTypes = entry.types.size > 1;
    byName.set(normalized(name), entry);
  }
  return [...byName.values()].map(({ types: _types, ...summary }) => summary);
}

export const onboardingInventoryItemSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter an ingredient name')
      .max(150, 'Name must be 150 characters or fewer'),
    sku: z
      .string()
      .trim()
      .max(60, 'SKU must be 60 characters or fewer')
      .transform((value) => value || null),
    baseUnit: z.string().trim().toUpperCase().pipe(inventoryBaseUnitSchema),
    reorderLevel: z.string().trim().regex(quantityPattern, 'Enter up to 3 decimal places'),
    openingQuantity: z
      .string()
      .trim()
      .refine((value) => !value || quantityPattern.test(value), 'Enter up to 3 decimal places')
      .transform((value) => value || null),
    openingUnitCost: z
      .string()
      .trim()
      .refine((value) => !value || costPattern.test(value), 'Enter up to 8 decimal places')
      .transform((value) => value || null),
  })
  .superRefine((row, ctx) => {
    if (row.openingQuantity !== null && row.openingUnitCost === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['openingUnitCost'],
        message: 'Enter the unit cost for opening stock',
      });
    }
    if (row.openingQuantity === null && row.openingUnitCost !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['openingQuantity'],
        message: 'Enter the opening quantity',
      });
    }
  })
  .describe('Opening quantity and unit cost go together: give both or neither');

/** Every problem with the ingredient rows, including the same name twice. */
export function findInventoryRowIssues(
  rows: readonly OnboardingInventoryRow[],
): OnboardingRowIssue[] {
  const issues: OnboardingRowIssue[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    issues.push(...schemaIssues(onboardingInventoryItemSchema, row, index));
    const key = normalized(row.name);
    if (!key) return;
    if (seen.has(key)) {
      issues.push({ index, line: row.line, field: 'name', message: 'Ingredient listed twice' });
    }
    seen.add(key);
  });
  return issues;
}

// ---------------------------------------------------------------------------------------------
// Finish: strict validation of each step that was filled in (not skipped)
// ---------------------------------------------------------------------------------------------

const integerText = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} must be a whole number`)
    .transform(Number)
    .pipe(
      z
        .number()
        .min(min, `${label} must be ${min}–${max}`)
        .max(max, `${label} must be ${min}–${max}`),
    );

export const completeOnboardingDetailsSchema = z
  .object({
    name: restaurantSettingsSchema.shape.name,
    address: z.string().trim().max(500, 'Address must be 500 characters or fewer'),
    gstNumber: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => !value || GSTIN_PATTERN.test(value), 'Enter a valid 15-character GSTIN')
      .transform((value) => value || null),
    defaultGstRate: restaurantSettingsSchema.shape.defaultGstRate,
    maxDiscountPercent: z
      .string()
      .trim()
      .regex(/^\d{1,3}(?:\.\d{1,2})?$/, 'Max discount must be a number with at most 2 decimals')
      .transform(Number)
      .pipe(z.number().max(100, 'Max discount must be between 0 and 100')),
    currency: restaurantSettingsSchema.shape.currency,
    timezone: restaurantSettingsSchema.shape.timezone,
  })
  .transform(({ address, ...details }) => ({ ...details, address: address || null }));

const completeFloorSchema = z
  .object({
    sections: z
      .array(
        z.object({
          key: rowKey,
          name: z
            .string()
            .trim()
            .min(1, 'Section name is required')
            .max(150, 'Section name must be 150 characters or fewer'),
          prefix: z.string(),
          tables: z
            .array(
              z.object({
                key: rowKey,
                number: z
                  .string()
                  .trim()
                  .min(1, 'Table number is required')
                  .max(50, 'Table number must be 50 characters or fewer'),
                capacity: integerText('Seats', 1, ONBOARDING_MAX_TABLE_CAPACITY),
              }),
            )
            .min(1, 'Add at least one table to this section')
            .max(ONBOARDING_MAX_TABLES_PER_SECTION),
        }),
      )
      .max(ONBOARDING_MAX_SECTIONS),
    customStatuses: z
      .array(
        z.object({
          key: rowKey,
          name: z
            .string()
            .trim()
            .min(1, 'Status name is required')
            .max(100, 'Status name must be 100 characters or fewer'),
        }),
      )
      .max(ONBOARDING_MAX_CUSTOM_STATUSES),
    cancellationReasons: z
      .array(
        z.object({
          key: rowKey,
          code: z.string().max(50).optional(),
          name: z
            .string()
            .trim()
            .min(1, 'Reason is required')
            .max(255, 'Reason must be 255 characters or fewer'),
        }),
      )
      .min(1, 'Keep at least one cancellation reason')
      .max(ONBOARDING_MAX_CANCELLATION_REASONS)
      .optional(),
  })
  .superRefine((floor, ctx) => {
    const sectionNames = new Set<string>();
    const tableNumbers = new Set<string>();
    floor.sections.forEach((section, sectionIndex) => {
      const name = normalized(section.name);
      if (sectionNames.has(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sections', sectionIndex, 'name'],
          message: 'Two sections have this name',
        });
      }
      sectionNames.add(name);
      section.tables.forEach((table, tableIndex) => {
        // Matches the case-insensitive unique index on restaurant_tables.
        const number = normalized(table.number);
        if (tableNumbers.has(number)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['sections', sectionIndex, 'tables', tableIndex, 'number'],
            message: `Table ${table.number} is used twice`,
          });
        }
        tableNumbers.add(number);
      });
    });

    const statusCodes = new Set<string>(SYSTEM_TABLE_STATUS_CODES);
    floor.customStatuses.forEach((status, index) => {
      const code = tableStatusCodeFromName(status.name);
      if (!code || statusCodes.has(code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['customStatuses', index, 'name'],
          message: code ? 'This status already exists' : 'Use letters or numbers in the name',
        });
      }
      statusCodes.add(code);
    });

    const reasonNames = new Set<string>();
    floor.cancellationReasons?.forEach((reason, index) => {
      const name = normalized(reason.name);
      if (reasonNames.has(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cancellationReasons', index, 'name'],
          message: 'This reason is listed twice',
        });
      }
      reasonNames.add(name);
    });
  });

const completeMenuSchema = onboardingMenuDraftSchema.superRefine((menu, ctx) => {
  if (menu.mode === 'later') return;
  for (const issue of findMenuRowIssues(menu.rows)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rows', issue.index, issue.field],
      message: issue.line ? `Row ${issue.line}: ${issue.message}` : issue.message,
    });
  }
});

const completeInventorySchema = onboardingInventoryDraftSchema.superRefine((inventory, ctx) => {
  for (const issue of findInventoryRowIssues(inventory.rows)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rows', issue.index, issue.field],
      message: issue.line ? `Row ${issue.line}: ${issue.message}` : issue.message,
    });
  }
});

const completeTeamSchema = z
  .object({
    members: z
      .array(
        z.object({
          key: rowKey,
          name: userNameSchema,
          email: userEmailSchema,
          role: onboardingTeamRoleSchema,
        }),
      )
      .max(ONBOARDING_TEAM_MAX_MEMBERS),
  })
  .superRefine((team, ctx) => {
    const emails = new Set<string>();
    team.members.forEach((member, index) => {
      if (emails.has(member.email)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['members', index, 'email'],
          message: 'Two people have this email',
        });
      }
      emails.add(member.email);
    });
  });

/**
 * Strict per-step rules, applied only to steps that were filled in. Restaurant name, currency and
 * time zone keep their signup values when the details step is skipped.
 */
export const completeOnboardingDataSchema = z
  .object({
    details: completeOnboardingDetailsSchema.optional(),
    floor: completeFloorSchema.optional(),
    menu: completeMenuSchema.optional(),
    inventory: completeInventorySchema.optional(),
    team: completeTeamSchema.optional(),
  })
  .strict();

/** Which finish stage a validation issue at `path` belongs to (drives "Fix in <step>"). */
export function onboardingStageForPath(path: readonly (string | number)[]): OnboardingStage {
  const [step, field] = path;
  if (step === 'floor') {
    return field === 'customStatuses' || field === 'cancellationReasons' ? 'statuses' : 'floor';
  }
  return onboardingStageSchema.safeParse(step).data ?? 'final';
}

// ---------------------------------------------------------------------------------------------
// Requests and responses
// ---------------------------------------------------------------------------------------------

export type OnboardingStatus = z.infer<typeof onboardingStateSchema>;

export const onboardingStateResponseSchema = z
  .object({
    /** Scopes the browser's local copy of the draft. */
    restaurantId: z.string().uuid(),
    status: onboardingStateSchema,
    /** Null until the owner leaves the Welcome screen. */
    currentStep: onboardingStepSchema.nullable(),
    skippedSteps: z.array(skippableOnboardingStepSchema),
    data: onboardingDraftDataSchema,
    version: z.number().int().nonnegative(),
    /** Null when there has never been a save (or after completion). */
    updatedAt: z.string().datetime().nullable(),
    /** The restaurant's saved profile; prefills step 1 and covers a skipped step at finish. */
    restaurant: z
      .object({
        name: z.string(),
        currency: z.string(),
        timezone: z.string(),
        gstNumber: z.string().nullable(),
        address: z.string().nullable(),
        defaultGstRate: z.number(),
        maxDiscountPercent: z.number(),
      })
      .strict(),
  })
  .strict();

export const saveOnboardingDraftRequestSchema = z
  .object({
    currentStep: onboardingStepSchema.nullable(),
    skippedSteps: z.array(skippableOnboardingStepSchema).max(SKIPPABLE_ONBOARDING_STEPS.length),
    data: onboardingDraftDataSchema,
    /** The version this save is based on; a stale one is rejected with 409. */
    version: z.number().int().nonnegative(),
  })
  .strict();

export const saveOnboardingDraftResponseSchema = z
  .object({ version: z.number().int().positive(), updatedAt: z.string().datetime() })
  .strict();

export const onboardingMenuPreviewResponseSchema = z
  .object({
    rows: z.array(onboardingMenuRowSchema),
    issues: z.array(onboardingRowIssueSchema),
    categories: z.array(onboardingMenuCategorySummarySchema),
  })
  .strict();

export const onboardingInventoryPreviewResponseSchema = z
  .object({
    rows: z.array(onboardingInventoryRowSchema),
    issues: z.array(onboardingRowIssueSchema),
  })
  .strict();

export const onboardingEmailAvailabilityQuerySchema = z.object({ email: userEmailSchema }).strict();
export const onboardingEmailAvailabilityResponseSchema = z
  .object({ available: z.boolean() })
  .strict();

export const completeOnboardingRequestSchema = z
  .object({
    skippedSteps: z.array(skippableOnboardingStepSchema).max(SKIPPABLE_ONBOARDING_STEPS.length),
    data: onboardingDraftDataSchema,
  })
  .strict();

export const onboardingInvitationSchema = z
  .object({
    userId: z.string().uuid(),
    name: z.string(),
    email: z.string(),
    role: onboardingTeamRoleSchema,
    /** False when the email couldn't be sent; Resend invitation on the Staff page retries it. */
    emailSent: z.boolean(),
  })
  .strict();

export const completeOnboardingResponseSchema = z
  .object({
    restaurantName: z.string(),
    counts: z
      .object({
        sections: z.number().int().nonnegative(),
        tables: z.number().int().nonnegative(),
        customStatuses: z.number().int().nonnegative(),
        menuCategories: z.number().int().nonnegative(),
        menuItems: z.number().int().nonnegative(),
        stockItems: z.number().int().nonnegative(),
        openingStock: z.number().int().nonnegative(),
        teamMembers: z.number().int().nonnegative(),
      })
      .strict(),
    /** One per team member: their account exists and an invitation email was (or will be) sent. */
    invitations: z.array(onboardingInvitationSchema),
    /**
     * True when invitations were not emailed because the owner's own email isn't verified yet
     * (the same rule as inviting staff later). The accounts exist; resend after verifying.
     */
    invitationsHeld: z.boolean(),
  })
  .strict();

/** Dashboard "Finish setting up" card, derived from what exists rather than from the draft. */
export const setupChecklistResponseSchema = z
  .object({
    details: z.boolean(),
    floor: z.boolean(),
    menu: z.boolean(),
    inventory: z.boolean(),
    team: z.boolean(),
    /** Active menu items with no recipe that aren't marked "No recipe needed". */
    missingRecipeCount: z.number().int().nonnegative(),
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// Error extensions (see `API_ERROR_CODES`)
// ---------------------------------------------------------------------------------------------

export const onboardingIncompleteErrorSchema = errorResponseSchema
  .extend({
    statusCode: z.literal(403),
    code: z.literal('ONBOARDING_INCOMPLETE'),
    restaurantName: z.string(),
  })
  .strict();

export const onboardingStageErrorSchema = errorResponseSchema
  .extend({
    code: z.literal('ONBOARDING_STAGE_FAILED'),
    stage: onboardingStageSchema,
  })
  .strict();

export const onboardingDraftConflictErrorSchema = errorResponseSchema
  .extend({
    statusCode: z.literal(409),
    code: z.literal('ONBOARDING_DRAFT_CONFLICT'),
    draft: onboardingStateResponseSchema,
  })
  .strict();

export type OnboardingDetailsDraft = z.infer<typeof onboardingDetailsDraftSchema>;
export type OnboardingTableDraft = z.infer<typeof onboardingTableDraftSchema>;
export type OnboardingSectionDraft = z.infer<typeof onboardingSectionDraftSchema>;
export type OnboardingCancellationReasonDraft = z.infer<
  typeof onboardingCancellationReasonDraftSchema
>;
export type OnboardingFloorDraft = z.infer<typeof onboardingFloorDraftSchema>;
export type OnboardingMenuRow = z.infer<typeof onboardingMenuRowSchema>;
export type OnboardingMenuDraft = z.infer<typeof onboardingMenuDraftSchema>;
export type OnboardingInventoryRow = z.infer<typeof onboardingInventoryRowSchema>;
export type OnboardingInventoryDraft = z.infer<typeof onboardingInventoryDraftSchema>;
export type OnboardingTeamMemberDraft = z.infer<typeof onboardingTeamMemberDraftSchema>;
export type OnboardingTeamDraft = z.infer<typeof onboardingTeamDraftSchema>;
export type OnboardingDraftData = z.infer<typeof onboardingDraftDataSchema>;
export type OnboardingRowIssue = z.infer<typeof onboardingRowIssueSchema>;
export type OnboardingMenuItem = z.output<typeof onboardingMenuItemSchema>;
export type OnboardingMenuCategorySummary = z.infer<typeof onboardingMenuCategorySummarySchema>;
export type OnboardingInventoryItem = z.output<typeof onboardingInventoryItemSchema>;
export type CompleteOnboardingDetails = z.output<typeof completeOnboardingDetailsSchema>;
export type CompleteOnboardingData = z.output<typeof completeOnboardingDataSchema>;
export type OnboardingStateResponse = z.infer<typeof onboardingStateResponseSchema>;
export type SaveOnboardingDraftRequest = z.infer<typeof saveOnboardingDraftRequestSchema>;
export type SaveOnboardingDraftResponse = z.infer<typeof saveOnboardingDraftResponseSchema>;
export type OnboardingMenuPreviewResponse = z.infer<typeof onboardingMenuPreviewResponseSchema>;
export type OnboardingInventoryPreviewResponse = z.infer<
  typeof onboardingInventoryPreviewResponseSchema
>;
export type OnboardingEmailAvailabilityQuery = z.infer<
  typeof onboardingEmailAvailabilityQuerySchema
>;
export type OnboardingEmailAvailabilityResponse = z.infer<
  typeof onboardingEmailAvailabilityResponseSchema
>;
export type CompleteOnboardingRequest = z.infer<typeof completeOnboardingRequestSchema>;
export type OnboardingInvitation = z.infer<typeof onboardingInvitationSchema>;
export type CompleteOnboardingResponse = z.infer<typeof completeOnboardingResponseSchema>;
export type SetupChecklistResponse = z.infer<typeof setupChecklistResponseSchema>;
export type OnboardingIncompleteError = z.infer<typeof onboardingIncompleteErrorSchema>;
export type OnboardingStageError = z.infer<typeof onboardingStageErrorSchema>;
export type OnboardingDraftConflictError = z.infer<typeof onboardingDraftConflictErrorSchema>;
