import { z } from 'zod';

import { billMoneySchema, paymentMethodSchema } from './bills';
import { kotDestinationSchema } from './orders';

/**
 * QR table ordering (REST-88). Guests scan a table's QR code, order from their phone, and every
 * round goes to the table's captain for approval before any kitchen ticket exists.
 *
 * Public guest endpoints live under `/qr/:token` (no staff auth; the tenant is resolved from the
 * token alone). Guest-session endpoints also need the `X-Guest-Secret` header issued by `join`.
 * Staff endpoints live under `/qr-orders` (JWT + permissions).
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export const GUEST_SECRET_HEADER = 'x-guest-secret';
export const QR_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export const qrTokenSchema = z.string().regex(QR_TOKEN_PATTERN, 'Invalid QR code');

/** Limits that keep a guest cart sane (validated on the server; mirrored in the UI). */
export const QR_MAX_CART_LINES = 40;
export const QR_MAX_LINE_QUANTITY = 20;
export const QR_ESCALATION_MIN_MINUTES = 1;
export const QR_ESCALATION_MAX_MINUTES = 15;
export const QR_DEFAULT_BRAND_COLOR = '#B3401C';
export const QR_MAX_UPI_IMAGE_BYTES = 1_000_000;

/**
 * One status set shared by the guest tracker, captain queue, floor board and kitchen display. The
 * UI pairs each with a fixed hue, icon and text label (CP1), so meaning never depends on colour.
 */
export const qrDisplayStatusSchema = z.enum([
  'awaiting',
  'escalated',
  'approved',
  'preparing',
  'ready',
  'served',
  'rejected',
]);
export type QrDisplayStatus = z.infer<typeof qrDisplayStatusSchema>;

export const qrRoundStatusSchema = z.enum(['AWAITING_APPROVAL', 'APPROVED', 'REJECTED']);
export const qrShareStatusSchema = z.enum(['UNPAID', 'PAYMENT_REQUESTED', 'PAID']);
export const qrSplitModeSchema = z.enum(['FULL', 'EQUAL', 'BY_ITEM', 'CUSTOM']);
export const qrAlertKindSchema = z.enum(['NO_CAPTAIN', 'ESCALATION']);
export const qrAlertStatusSchema = z.enum(['OPEN', 'RESOLVED', 'DISMISSED']);

/** Why guests at a table can or cannot order. INVALID tokens get a generic 404 instead. */
/**
 * `TABLE_RESERVED`: the table is held for a booking (the floor shows Reserved from 90 minutes before
 * it); `TABLE_CLEANING`: it is marked Needs cleaning. Guests already eating keep ordering because a
 * table with an open order stays Occupied.
 */
export const qrOrderingStateSchema = z.enum([
  'OPEN',
  'NO_CAPTAIN',
  'CLOSED',
  'TABLE_INACTIVE',
  'TABLE_RESERVED',
  'TABLE_CLEANING',
]);
export type QrOrderingState = z.infer<typeof qrOrderingStateSchema>;

/** `#RRGGBB` hex colour. */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Enter a colour like #B3401C')
  .transform((value) => value.toUpperCase());

export const qrRealtimeConfigSchema = z
  .object({ key: z.string().min(1), cluster: z.string().min(1), channel: z.string().min(1) })
  .strict();
export type QrRealtimeConfig = z.infer<typeof qrRealtimeConfigSchema>;

export const qrChannelAuthRequestSchema = z
  .object({
    socket_id: z
      .string()
      .regex(/^\d+\.\d+$/)
      .max(100),
    channel_name: z.string().min(1).max(200),
  })
  .strict();
export const qrChannelAuthResponseSchema = z.object({ auth: z.string() }).strict();
export type QrChannelAuthRequest = z.infer<typeof qrChannelAuthRequestSchema>;
export type QrChannelAuthResponse = z.infer<typeof qrChannelAuthResponseSchema>;

/** Pusher event on the guest session channel and the staff QR channel: refetch on receipt. */
export const QR_CHANGED_EVENT = 'qr.changed';
export const qrChangedEventSchema = z
  .object({
    kind: z.enum([
      'round.submitted',
      'round.approved',
      'round.rejected',
      'round.on-my-way',
      'round.escalated',
      'round.kitchen',
      'round.ready',
      'captain.changed',
      'cart.changed',
      'bill.requested',
      'bill.changed',
      'session.closed',
      'alert.changed',
      'call-server',
    ]),
    tableId: z.string().uuid().optional(),
    roundId: z.string().uuid().optional(),
  })
  .strict();
export type QrChangedEvent = z.infer<typeof qrChangedEventSchema>;

const moneyTotalsSchema = z
  .object({
    subtotal: billMoneySchema,
    discount: billMoneySchema,
    /** GST rate in percent, e.g. "5.00"; shown split equally as CGST and SGST. */
    gstRate: z.string(),
    cgst: billMoneySchema,
    sgst: billMoneySchema,
    /** Signed rounding to the nearest rupee, e.g. "0.50" or "-0.25". */
    roundOff: z.string().regex(/^-?\d{1,10}\.\d{2}$/),
    total: billMoneySchema,
  })
  .strict();
export type QrMoneyTotals = z.infer<typeof moneyTotalsSchema>;
export { moneyTotalsSchema as qrMoneyTotalsSchema };

// ---------------------------------------------------------------------------
// Guest (public)
// ---------------------------------------------------------------------------

export const qrRestaurantBrandSchema = z
  .object({
    name: z.string(),
    /** Up to two letters for the round logo mark. */
    initials: z.string(),
    /** Validated to give 4.5:1 with white text; falls back to the default otherwise. */
    brandColor: z.string(),
    guestPhone: z.string().nullable(),
    currency: z.string(),
  })
  .strict();

export const qrResolveResponseSchema = z
  .object({
    state: qrOrderingStateSchema,
    restaurant: qrRestaurantBrandSchema,
    table: z.object({ id: z.string().uuid(), number: z.string() }).strict(),
    /** First name only, e.g. "Arjun". Null when no captain is assigned. */
    captainName: z.string().nullable(),
    /** Pusher key/cluster for the guest session channel; the channel comes from the session. */
    realtime: z.object({ key: z.string(), cluster: z.string() }).strict(),
  })
  .strict();
export type QrResolveResponse = z.infer<typeof qrResolveResponseSchema>;

export const qrMenuItemSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    price: billMoneySchema,
    /** true = veg, false = non-veg, null = not marked. */
    isVeg: z.boolean().nullable(),
    /** False shows "Sold out today". */
    available: z.boolean(),
    servingType: z.enum(['FOOD', 'BAR']),
  })
  .strict();
export const qrMenuCategorySchema = z
  .object({ id: z.string().uuid(), name: z.string(), items: z.array(qrMenuItemSchema) })
  .strict();
export const qrMenuResponseSchema = z
  .object({ categories: z.array(qrMenuCategorySchema) })
  .strict();
export type QrMenuItem = z.infer<typeof qrMenuItemSchema>;
export type QrMenuCategory = z.infer<typeof qrMenuCategorySchema>;
export type QrMenuResponse = z.infer<typeof qrMenuResponseSchema>;

export const qrJoinRequestSchema = z
  .object({
    name: z
      .string({ required_error: 'Enter your name' })
      .trim()
      .min(1, 'Enter your name')
      .max(80, 'Name must be 80 characters or fewer'),
    phone: z
      .string({ required_error: 'Enter your phone number' })
      .trim()
      .regex(/^\+?[0-9][0-9 -]{6,18}[0-9]$/, 'Enter a valid phone number'),
  })
  .strict();
export const qrJoinResponseSchema = z
  .object({
    /** Keep on the device and send as `X-Guest-Secret`. Shown once; only its hash is stored. */
    guestSecret: z.string().min(32),
    guestId: z.string().uuid(),
    sessionId: z.string().uuid(),
  })
  .strict();
export type QrJoinRequest = z.infer<typeof qrJoinRequestSchema>;
export type QrJoinResponse = z.infer<typeof qrJoinResponseSchema>;

export const qrGuestSchema = z
  .object({ id: z.string().uuid(), name: z.string(), isMe: z.boolean() })
  .strict();

export const qrCartLineSchema = z
  .object({
    id: z.string().uuid(),
    menuItemId: z.string().uuid(),
    name: z.string(),
    isVeg: z.boolean().nullable(),
    unitPrice: billMoneySchema,
    quantity: z.number().int().positive(),
    lineTotal: billMoneySchema,
    specialInstructions: z.string().nullable(),
    available: z.boolean(),
    addedBy: qrGuestSchema,
  })
  .strict();
export type QrCartLine = z.infer<typeof qrCartLineSchema>;

export const qrEditChangeSchema = z
  .object({
    name: z.string(),
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
    outOfStock: z.boolean(),
  })
  .strict();
export type QrEditChange = z.infer<typeof qrEditChangeSchema>;

export const qrGuestRoundItemSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    isVeg: z.boolean().nullable(),
    quantity: z.number().int().nonnegative(),
    requestedQuantity: z.number().int().positive(),
    unitPrice: billMoneySchema,
    specialInstructions: z.string().nullable(),
    status: z.enum(['ACTIVE', 'REMOVED', 'OUT_OF_STOCK']),
    addedBy: z.string(),
  })
  .strict();

export const qrGuestRoundSchema = z
  .object({
    id: z.string().uuid(),
    number: z.number().int().positive(),
    status: qrDisplayStatusSchema,
    captainName: z.string().nullable(),
    /** Set when the table was handed over while this round waited ("Priya is now…"). */
    previousCaptainName: z.string().nullable(),
    submittedAt: z.string().datetime(),
    approvedAt: z.string().datetime().nullable(),
    rejectedAt: z.string().datetime().nullable(),
    rejectReason: z.string().nullable(),
    preparingAt: z.string().datetime().nullable(),
    readyAt: z.string().datetime().nullable(),
    servedAt: z.string().datetime().nullable(),
    edits: z.array(qrEditChangeSchema),
    editNote: z.string().nullable(),
    itemCount: z.number().int().nonnegative(),
    items: z.array(qrGuestRoundItemSchema),
    totals: moneyTotalsSchema,
  })
  .strict();
export type QrGuestRound = z.infer<typeof qrGuestRoundSchema>;

export const qrBillLineSchema = z
  .object({
    orderItemId: z.string().uuid(),
    name: z.string(),
    quantity: z.number().int().positive(),
    unitPrice: billMoneySchema,
    lineTotal: billMoneySchema,
    /** Who added it on the QR order; null for items the staff entered. */
    addedBy: z.string().nullable(),
  })
  .strict();
export type QrBillLine = z.infer<typeof qrBillLineSchema>;

export const qrShareSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string(),
    guestId: z.string().uuid().nullable(),
    isMine: z.boolean(),
    amount: billMoneySchema,
    status: qrShareStatusSchema,
    requestedMethod: paymentMethodSchema.nullable(),
    paymentMethod: paymentMethodSchema.nullable(),
    paidAmount: billMoneySchema.nullable(),
    paidAt: z.string().datetime().nullable(),
    claimedItems: z
      .array(z.object({ orderItemId: z.string().uuid(), quantity: z.number().int().positive() }))
      .nullable(),
  })
  .strict();
export type QrShare = z.infer<typeof qrShareSchema>;

export const qrGuestBillSchema = z
  .object({
    roundCount: z.number().int().nonnegative(),
    lines: z.array(qrBillLineSchema),
    totals: moneyTotalsSchema,
    /** The amount guests pay: the total rounded to the nearest rupee. */
    payable: billMoneySchema,
    paid: billMoneySchema,
    remaining: billMoneySchema,
    splitMode: qrSplitModeSchema.nullable(),
    shares: z.array(qrShareSchema),
    settled: z.boolean(),
  })
  .strict();
export type QrGuestBill = z.infer<typeof qrGuestBillSchema>;

export const qrSessionResponseSchema = z
  .object({
    sessionId: z.string().uuid(),
    status: z.enum(['OPEN', 'CLOSED']),
    state: qrOrderingStateSchema,
    me: qrGuestSchema,
    guests: z.array(qrGuestSchema),
    captainName: z.string().nullable(),
    cart: z
      .object({
        lines: z.array(qrCartLineSchema),
        itemCount: z.number().int().nonnegative(),
        totals: moneyTotalsSchema,
      })
      .strict(),
    rounds: z.array(qrGuestRoundSchema),
    billRequestedAt: z.string().datetime().nullable(),
    bill: qrGuestBillSchema.nullable(),
    realtimeChannel: z.string(),
    serverTime: z.string().datetime(),
  })
  .strict();
export type QrSessionResponse = z.infer<typeof qrSessionResponseSchema>;

export const qrAddCartItemRequestSchema = z
  .object({
    menuItemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(QR_MAX_LINE_QUANTITY),
    specialInstructions: z.string().trim().max(255).optional(),
  })
  .strict();
export const qrUpdateCartItemRequestSchema = z
  .object({ quantity: z.number().int().min(0).max(QR_MAX_LINE_QUANTITY) })
  .strict()
  .describe('Quantity 0 removes the line.');
export type QrAddCartItemRequest = z.infer<typeof qrAddCartItemRequestSchema>;
export type QrUpdateCartItemRequest = z.infer<typeof qrUpdateCartItemRequestSchema>;

export const qrSubmitRoundRequestSchema = z
  .object({
    /** Generate once per Send tap; repeating it returns the same round (double-tap safe). */
    idempotencyKey: z.string().uuid(),
    note: z.string().trim().max(255).optional(),
  })
  .strict();
export type QrSubmitRoundRequest = z.infer<typeof qrSubmitRoundRequestSchema>;

export const qrSplitRequestSchema = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('FULL') }).strict(),
    z.object({ mode: z.literal('EQUAL'), people: z.number().int().min(2).max(20) }).strict(),
    z
      .object({
        mode: z.literal('BY_ITEM'),
        items: z
          .array(
            z
              .object({
                orderItemId: z.string().uuid(),
                quantity: z.number().int().positive(),
              })
              .strict(),
          )
          .min(1)
          .max(100),
      })
      .strict(),
    z.object({ mode: z.literal('CUSTOM'), amount: billMoneySchema }).strict(),
  ])
  .describe(
    'FULL and EQUAL replace every unpaid share; BY_ITEM and CUSTOM create or replace your own share.',
  );
export type QrSplitRequest = z.infer<typeof qrSplitRequestSchema>;

export const qrRequestPaymentRequestSchema = z
  .object({ method: paymentMethodSchema })
  .strict()
  .describe('Asks the captain to come and collect: UPI (they bring the QR), CASH or CARD.');
export type QrRequestPaymentRequest = z.infer<typeof qrRequestPaymentRequestSchema>;

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export const qrQueueScopeSchema = z.enum(['mine', 'all']);
export const qrQueueQuerySchema = z.object({ scope: qrQueueScopeSchema.default('mine') }).strict();
export type QrQueueScope = z.infer<typeof qrQueueScopeSchema>;
export type QrQueueQuery = z.infer<typeof qrQueueQuerySchema>;

const staffRefSchema = z.object({ id: z.string().uuid(), name: z.string() }).strict();

export const qrQueueCardSchema = z
  .object({
    roundId: z.string().uuid(),
    sessionId: z.string().uuid(),
    table: z.object({ id: z.string().uuid(), number: z.string() }).strict(),
    roundNumber: z.number().int().positive(),
    status: qrDisplayStatusSchema,
    guestCount: z.number().int().nonnegative(),
    itemCount: z.number().int().nonnegative(),
    total: billMoneySchema,
    itemsSummary: z.string(),
    submittedAt: z.string().datetime(),
    escalateAt: z.string().datetime().nullable(),
    escalatedAt: z.string().datetime().nullable(),
    onMyWayAt: z.string().datetime().nullable(),
    rejectedAt: z.string().datetime().nullable(),
    rejectReason: z.string().nullable(),
    captain: staffRefSchema.nullable(),
    /** True when the caller may approve/reject this round (owner captain or a manager). */
    canAct: z.boolean(),
  })
  .strict();
export type QrQueueCard = z.infer<typeof qrQueueCardSchema>;

export const qrBillRequestCardSchema = z
  .object({
    sessionId: z.string().uuid(),
    table: z.object({ id: z.string().uuid(), number: z.string() }).strict(),
    requestedAt: z.string().datetime(),
    payable: billMoneySchema,
    sharesPaid: z.number().int().nonnegative(),
    sharesTotal: z.number().int().nonnegative(),
    paymentRequested: z.boolean(),
    captain: staffRefSchema.nullable(),
  })
  .strict();
export type QrBillRequestCard = z.infer<typeof qrBillRequestCardSchema>;

export const qrQueueResponseSchema = z
  .object({
    scope: qrQueueScopeSchema,
    awaiting: z.array(qrQueueCardSchema),
    sentToKitchen: z.array(qrQueueCardSchema),
    billRequested: z.array(qrBillRequestCardSchema),
    rejected: z.array(qrQueueCardSchema),
    /** Rounds awaiting approval on the caller's own tables (nav badge + persistent strip). */
    myWaitingCount: z.number().int().nonnegative(),
    oldestWaitingSince: z.string().datetime().nullable(),
    escalationMinutes: z.number().int(),
    /** Whether the caller can act on any table (`qr-order:manage`). */
    canManage: z.boolean(),
    serverTime: z.string().datetime(),
  })
  .strict();
export type QrQueueResponse = z.infer<typeof qrQueueResponseSchema>;

export const qrSummaryResponseSchema = z
  .object({
    enabled: z.boolean(),
    myWaitingCount: z.number().int().nonnegative(),
    oldestWaitingSince: z.string().datetime().nullable(),
    openAlerts: z.number().int().nonnegative(),
    escalationMinutes: z.number().int(),
    serverTime: z.string().datetime(),
  })
  .strict();
export type QrSummaryResponse = z.infer<typeof qrSummaryResponseSchema>;

export const qrReviewItemSchema = z
  .object({
    id: z.string().uuid(),
    menuItemId: z.string().uuid(),
    name: z.string(),
    isVeg: z.boolean().nullable(),
    destination: kotDestinationSchema,
    requestedQuantity: z.number().int().positive(),
    quantity: z.number().int().nonnegative(),
    unitPrice: billMoneySchema,
    specialInstructions: z.string().nullable(),
    status: z.enum(['ACTIVE', 'REMOVED', 'OUT_OF_STOCK']),
    addedBy: z.string(),
    /** False when the menu item has since been marked sold out. */
    available: z.boolean(),
  })
  .strict();
export type QrReviewItem = z.infer<typeof qrReviewItemSchema>;

export const qrRoundDetailSchema = z
  .object({
    roundId: z.string().uuid(),
    sessionId: z.string().uuid(),
    table: z.object({ id: z.string().uuid(), number: z.string() }).strict(),
    roundNumber: z.number().int().positive(),
    status: qrDisplayStatusSchema,
    guests: z.array(z.object({ id: z.string().uuid(), name: z.string() }).strict()),
    note: z.string().nullable(),
    items: z.array(qrReviewItemSchema),
    totals: moneyTotalsSchema,
    submittedAt: z.string().datetime(),
    escalateAt: z.string().datetime().nullable(),
    escalatedAt: z.string().datetime().nullable(),
    onMyWayAt: z.string().datetime().nullable(),
    approvedAt: z.string().datetime().nullable(),
    approvedBy: staffRefSchema.nullable(),
    rejectedAt: z.string().datetime().nullable(),
    rejectReason: z.string().nullable(),
    captain: staffRefSchema.nullable(),
    canAct: z.boolean(),
    escalationMinutes: z.number().int(),
    serverTime: z.string().datetime(),
  })
  .strict();
export type QrRoundDetail = z.infer<typeof qrRoundDetailSchema>;

export const qrApproveRoundRequestSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            quantity: z.number().int().min(0).max(QR_MAX_LINE_QUANTITY),
            outOfStock: z.boolean().default(false),
          })
          .strict(),
      )
      .max(QR_MAX_CART_LINES)
      .default([])
      .describe('Only lines that changed; quantity 0 removes a line, outOfStock flags it.'),
    note: z.string().trim().max(255).optional(),
  })
  .strict();
export type QrApproveRoundRequest = z.infer<typeof qrApproveRoundRequestSchema>;

/** Preset reasons on the reject sheet (C3c); the guest reads the free-text message. */
export const QR_REJECT_REASONS = [
  'Item out of stock',
  'Kitchen is closed for this',
  'Table needs to be moved',
  'Need to clarify with the guest',
] as const;
export const qrRejectRoundRequestSchema = z
  .object({
    reason: z.string().trim().min(1, 'Choose or write a reason').max(255),
  })
  .strict();
export type QrRejectRoundRequest = z.infer<typeof qrRejectRoundRequestSchema>;

export const qrStaffBillSchema = z
  .object({
    sessionId: z.string().uuid(),
    table: z.object({ id: z.string().uuid(), number: z.string() }).strict(),
    orderId: z.string().uuid().nullable(),
    billId: z.string().uuid().nullable(),
    requestedAt: z.string().datetime().nullable(),
    roundCount: z.number().int().nonnegative(),
    guestCount: z.number().int().nonnegative(),
    lines: z.array(qrBillLineSchema),
    totals: moneyTotalsSchema,
    payable: billMoneySchema,
    paid: billMoneySchema,
    remaining: billMoneySchema,
    splitMode: qrSplitModeSchema.nullable(),
    shares: z.array(qrShareSchema),
    hasUpiQr: z.boolean(),
    settled: z.boolean(),
  })
  .strict();
export type QrStaffBill = z.infer<typeof qrStaffBillSchema>;

export const qrRecordSharePaymentRequestSchema = z
  .object({
    method: paymentMethodSchema,
    amount: billMoneySchema,
    referenceNumber: z.string().trim().max(255).optional(),
  })
  .strict()
  .describe(
    'Staff confirm a payment they have verified (UPI on the restaurant QR, cash or card). Guests can never mark a share paid.',
  );
export type QrRecordSharePaymentRequest = z.infer<typeof qrRecordSharePaymentRequestSchema>;

export const qrCollectAtTableRequestSchema = z
  .object({
    method: paymentMethodSchema,
    amount: billMoneySchema,
    referenceNumber: z.string().trim().max(255).optional(),
  })
  .strict()
  .describe('Records a payment for whatever is still unpaid, without a guest-created share.');
export type QrCollectAtTableRequest = z.infer<typeof qrCollectAtTableRequestSchema>;

export const qrCaptainOptionSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    activeTables: z.number().int().nonnegative(),
    pendingOrders: z.number().int().nonnegative(),
    available: z.boolean(),
    lightestLoad: z.boolean(),
    isCurrent: z.boolean(),
  })
  .strict();
export const qrCaptainOptionsQuerySchema = z
  .object({ tableId: z.string().uuid().optional() })
  .strict();
export const qrCaptainOptionsResponseSchema = z
  .object({ data: z.array(qrCaptainOptionSchema) })
  .strict();
export type QrCaptainOption = z.infer<typeof qrCaptainOptionSchema>;
export type QrCaptainOptionsQuery = z.infer<typeof qrCaptainOptionsQuerySchema>;
export type QrCaptainOptionsResponse = z.infer<typeof qrCaptainOptionsResponseSchema>;

export const qrAssignCaptainRequestSchema = z
  .object({
    captainUserId: z.string().uuid(),
    /** Move rounds still awaiting approval to the new captain (restarts their timer). */
    moveWaitingOrders: z.boolean().default(true),
  })
  .strict();
export const qrAssignCaptainResponseSchema = z
  .object({
    tableId: z.string().uuid(),
    captain: staffRefSchema,
    movedRounds: z.number().int().nonnegative(),
  })
  .strict();
export type QrAssignCaptainRequest = z.infer<typeof qrAssignCaptainRequestSchema>;
export type QrAssignCaptainResponse = z.infer<typeof qrAssignCaptainResponseSchema>;

export const qrAlertSchema = z
  .object({
    id: z.string().uuid(),
    kind: qrAlertKindSchema,
    status: qrAlertStatusSchema,
    table: z.object({ id: z.string().uuid(), number: z.string() }).strict(),
    roundId: z.string().uuid().nullable(),
    roundNumber: z.number().int().nullable(),
    captain: staffRefSchema.nullable(),
    guestCount: z.number().int().nonnegative(),
    itemCount: z.number().int().nonnegative(),
    total: billMoneySchema.nullable(),
    waitingSince: z.string().datetime().nullable(),
    resolution: z.string().nullable(),
    createdAt: z.string().datetime(),
    resolvedAt: z.string().datetime().nullable(),
  })
  .strict();
export const qrAlertsResponseSchema = z
  .object({
    open: z.array(qrAlertSchema),
    recent: z.array(qrAlertSchema),
    escalationMinutes: z.number().int(),
    serverTime: z.string().datetime(),
  })
  .strict();
export type QrAlert = z.infer<typeof qrAlertSchema>;
export type QrAlertsResponse = z.infer<typeof qrAlertsResponseSchema>;

export const qrFloorTableSchema = z
  .object({
    tableId: z.string().uuid(),
    waitingSince: z.string().datetime().nullable(),
    escalated: z.boolean(),
    billRequested: z.boolean(),
    noCaptain: z.boolean(),
  })
  .strict();
export const qrFloorResponseSchema = z
  .object({
    enabled: z.boolean(),
    tables: z.array(qrFloorTableSchema),
    escalationMinutes: z.number().int(),
    serverTime: z.string().datetime(),
  })
  .strict();
export type QrFloorTable = z.infer<typeof qrFloorTableSchema>;
export type QrFloorResponse = z.infer<typeof qrFloorResponseSchema>;

// ----- Settings & cards -----

export const qrSettingsSchema = z
  .object({
    enabled: z.boolean(),
    escalationMinutes: z.number().int(),
    guestPhone: z.string().nullable(),
    brandColor: z.string().nullable(),
    hasUpiQr: z.boolean(),
    upiQrUpdatedAt: z.string().datetime().nullable(),
  })
  .strict();
export const updateQrSettingsRequestSchema = z
  .object({
    enabled: z.boolean(),
    escalationMinutes: z
      .number()
      .int()
      .min(QR_ESCALATION_MIN_MINUTES, `At least ${QR_ESCALATION_MIN_MINUTES} minute`)
      .max(QR_ESCALATION_MAX_MINUTES, `At most ${QR_ESCALATION_MAX_MINUTES} minutes`),
    guestPhone: z
      .string()
      .trim()
      .max(30, 'Phone number must be 30 characters or fewer')
      .refine((value) => value === '' || /^\+?[0-9][0-9 -]{5,27}[0-9]$/.test(value), {
        message: 'Enter a valid phone number',
      })
      .transform((value) => value || null),
    brandColor: z
      .union([hexColorSchema, z.literal('')])
      .transform((value) => value || null)
      .describe('Must give 4.5:1 contrast with white text; empty uses the default.'),
  })
  .strict();
export type QrSettings = z.infer<typeof qrSettingsSchema>;
export type UpdateQrSettingsRequest = z.infer<typeof updateQrSettingsRequestSchema>;

export const uploadUpiQrRequestSchema = z
  .object({
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    /** Base64 image bytes (no data: prefix), at most 1 MB decoded. */
    data: z
      .string()
      .min(1)
      .max(Math.ceil((QR_MAX_UPI_IMAGE_BYTES * 4) / 3) + 4)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Invalid image data'),
  })
  .strict();
export type UploadUpiQrRequest = z.infer<typeof uploadUpiQrRequestSchema>;

export const qrTableCardSchema = z
  .object({
    tableId: z.string().uuid(),
    tableNumber: z.string(),
    section: z.string(),
    isActive: z.boolean(),
    token: qrTokenSchema,
  })
  .strict();
export const qrTableCardsResponseSchema = z
  .object({
    restaurant: qrRestaurantBrandSchema,
    data: z.array(qrTableCardSchema),
  })
  .strict();
export type QrTableCard = z.infer<typeof qrTableCardSchema>;
export type QrTableCardsResponse = z.infer<typeof qrTableCardsResponseSchema>;

// ----- Web push -----

export const pushConfigResponseSchema = z
  .object({ publicKey: z.string().nullable() })
  .strict()
  .describe('Null when the server has no VAPID keys configured; push is then disabled.');
export const pushSubscriptionRequestSchema = z
  .object({
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }),
  })
  .strip();
export const pushUnsubscribeRequestSchema = z
  .object({ endpoint: z.string().url().max(1000) })
  .strict();
export type PushConfigResponse = z.infer<typeof pushConfigResponseSchema>;
export type PushSubscriptionRequest = z.infer<typeof pushSubscriptionRequestSchema>;
export type PushUnsubscribeRequest = z.infer<typeof pushUnsubscribeRequestSchema>;

export const okResponseSchema = z.object({ ok: z.literal(true) }).strict();
export type OkResponse = z.infer<typeof okResponseSchema>;
