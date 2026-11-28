import { z } from 'zod';

import type { BillInvoice } from './bills';

export const thermalDestinations = ['RECEIPT', 'KITCHEN', 'BAR'] as const;
export const thermalDestinationSchema = z.enum(thermalDestinations);
export const thermalKindSchema = z.enum(['receipt', 'ticket']);
export const thermalPaperSchema = z.enum(['58', '80']);
export const thermalTransportSchema = z.enum(['network', 'usb']);
export const thermalTicketLayoutSchema = z.enum(['STANDARD', 'COMPACT', 'DETAILED']);
export const KOT_PRINT_QUEUE_TIMEOUT_MS = 120_000;
export const KOT_PRINT_ATTEMPT_TIMEOUT_MS = 20_000;
export const thermalTicketPrintStatusSchema = z.enum(['QUEUED', 'PRINTING', 'SENT', 'UNCONFIRMED']);
export const thermalCodePageSchema = z.enum(['ASCII', 'CP437', 'CP858']);
export const thermalProfileSchema = z
  .object({
    connection: thermalTransportSchema,
    paper: thermalPaperSchema,
    codePage: thermalCodePageSchema,
    columns: z.number().int().min(16).max(72).nullable(),
  })
  .strict();
export const thermalNetworkSchema = z
  .object({
    host: z
      .string()
      .trim()
      .ip({ version: 'v4', message: 'Enter an IPv4 address' })
      .refine((host) => {
        const [first, second = 0] = host.split('.').map(Number);
        return (
          first === 10 ||
          (first === 172 && second >= 16 && second <= 31) ||
          (first === 192 && second === 168)
        );
      }, 'Enter a private LAN IPv4 address'),
    port: z.number().int().min(1).max(65535),
  })
  .strict();
export const thermalUsbDeviceSchema = z
  .string()
  .trim()
  .max(32)
  .regex(/^\/dev\/usb\/lp\d+$/, 'Use a Linux printer device such as /dev/usb/lp0');
export const thermalSettingsSchema = thermalProfileSchema.extend({
  network: thermalNetworkSchema.nullable(),
  usbDevice: thermalUsbDeviceSchema.nullable().optional(),
  ticketLayout: thermalTicketLayoutSchema.optional(),
  autoPrint: z.boolean().optional(),
});
export const thermalPrintRequestSchema = z
  .object({
    transport: thermalTransportSchema,
    paper: thermalPaperSchema,
    copy: z.boolean().optional(),
  })
  .strict();
export const thermalDocumentSchema = z
  .object({
    title: z.string(),
    lines: z.array(z.string()),
    transport: z.array(thermalTransportSchema),
    profile: thermalProfileSchema,
  })
  .strict();
export const thermalConfigurationSchema = thermalSettingsSchema.extend({
  destination: thermalDestinationSchema,
  transports: z.array(thermalTransportSchema),
  usbDevice: thermalUsbDeviceSchema.nullable(),
  ticketLayout: thermalTicketLayoutSchema,
  autoPrint: z.boolean(),
});
export const thermalPrinterStatusSchema = z.array(thermalConfigurationSchema);
export const thermalTestRequestSchema = thermalPrintRequestSchema.omit({ copy: true }).extend({
  destination: thermalDestinationSchema,
});
export const thermalCheckRequestSchema = thermalTestRequestSchema.omit({ paper: true });
export type ThermalCheckRequest = z.infer<typeof thermalCheckRequestSchema>;
export type ThermalDestination = z.infer<typeof thermalDestinationSchema>;
export type ThermalDocument = z.infer<typeof thermalDocumentSchema>;
export type ThermalKind = z.infer<typeof thermalKindSchema>;
export type ThermalPrintRequest = z.infer<typeof thermalPrintRequestSchema>;
export type ThermalPrinterStatus = z.infer<typeof thermalPrinterStatusSchema>;
export type ThermalConfiguration = z.infer<typeof thermalConfigurationSchema>;
export type ThermalProfile = z.infer<typeof thermalProfileSchema>;
export type ThermalSettings = z.infer<typeof thermalSettingsSchema>;
export type ThermalTestRequest = z.infer<typeof thermalTestRequestSchema>;

export type ThermalTicketLayout = z.infer<typeof thermalTicketLayoutSchema>;

type StationTicket = {
  destination: 'KITCHEN' | 'BAR';
  kotNumber: string;
  correctionOf?: string;
  table: { tableNumber: string; section: { name: string } };
  createdAt: string;
  items: readonly {
    quantity: number;
    name: string;
    specialInstructions: string | null;
    void?: { reason: string };
  }[];
  qr?: { approvedBy: string } | null;
};

export function formatThermalTicket(
  ticket: StationTicket,
  layout: ThermalTicketLayout,
): Pick<ThermalDocument, 'title' | 'lines'> {
  const table = 'Table ' + ticket.table.tableNumber;
  const header = ticket.kotNumber + ' / ' + table;
  const items = ticket.items.flatMap(
    ({ quantity, name, specialInstructions, void: cancellation }) => [
      (cancellation ? 'VOID ' : '') + quantity + ' x ' + name,
      ...(cancellation
        ? ['  Reason: ' + cancellation.reason]
        : specialInstructions
          ? ['  ' + specialInstructions]
          : []),
    ],
  );
  const title = ticket.destination + ' TICKET';
  if (ticket.correctionOf) {
    return {
      title: 'VOID ' + title,
      lines: [header, 'Original ticket ' + ticket.correctionOf, ticket.createdAt, '', ...items],
    };
  }
  if (layout === 'COMPACT') return { title, lines: [header, ...items] };
  if (layout === 'DETAILED') {
    return {
      title,
      lines: [
        'Ticket ' + ticket.kotNumber,
        table + ' / ' + ticket.table.section.name,
        'Sent ' + ticket.createdAt,
        ...(ticket.qr ? ['QR order / Approved by ' + ticket.qr.approvedBy] : ['Staff order']),
        '',
        ...items,
        '',
        'Total items: ' +
          ticket.items.reduce((count, item) => count + (item.void ? 0 : item.quantity), 0),
      ],
    };
  }
  return { title, lines: [header, ticket.createdAt, '', ...items] };
}

export function sampleThermalTicket(
  destination: StationTicket['destination'],
  layout: ThermalTicketLayout,
  createdAt: string,
): Pick<ThermalDocument, 'title' | 'lines'> {
  return formatThermalTicket(
    {
      destination,
      kotNumber: 'KOT-000123',
      table: { tableNumber: '12', section: { name: 'Main dining' } },
      createdAt,
      items:
        destination === 'KITCHEN'
          ? [
              { quantity: 2, name: 'Paneer tikka', specialInstructions: 'One without onions' },
              { quantity: 1, name: 'Garlic naan', specialInstructions: null },
            ]
          : [{ quantity: 2, name: 'Fresh lime soda', specialInstructions: 'One without ice' }],
    },
    layout,
  );
}

type ReceiptInvoice = Pick<BillInvoice, 'restaurant' | 'cgst' | 'sgst' | 'payment'> & {
  bill: Pick<
    BillInvoice['bill'],
    | 'billNumber'
    | 'status'
    | 'generatedAt'
    | 'timezone'
    | 'subtotal'
    | 'discountAmount'
    | 'currency'
    | 'totalAmount'
  > & {
    table: Pick<BillInvoice['bill']['table'], 'tableNumber'>;
    lines: readonly Pick<
      BillInvoice['bill']['lines'][number],
      'name' | 'quantity' | 'unitPrice' | 'amount'
    >[];
  };
};

export function formatThermalReceipt(
  { bill, restaurant, cgst, sgst, payment }: ReceiptInvoice,
  layout: ThermalTicketLayout,
): Pick<ThermalDocument, 'title' | 'lines'> {
  const detailed = layout === 'DETAILED';
  const gap = layout === 'COMPACT' ? [] : [''];
  const localDateTime = (date: string): string =>
    new Date(date).toLocaleString('en-IN', { timeZone: bill.timezone });
  return {
    title: restaurant.name,
    lines: [
      ...(restaurant.address ? [restaurant.address] : []),
      ...(restaurant.gstNumber ? ['GSTIN ' + restaurant.gstNumber] : []),
      bill.billNumber + ' / Table ' + bill.table.tableNumber,
      bill.status === 'PAID' ? 'PAID' : 'PROFORMA / UNPAID',
      localDateTime(bill.generatedAt),
      ...gap,
      ...bill.lines.flatMap(({ quantity, name, amount, unitPrice }) =>
        detailed
          ? [quantity + ' x ' + name, '  ' + unitPrice + ' each / ' + amount]
          : [quantity + ' x ' + name + '  ' + amount],
      ),
      ...gap,
      'Subtotal ' + bill.subtotal,
      'Discount ' + bill.discountAmount,
      ...(detailed
        ? ['CGST (' + cgst.rate + '%) ' + cgst.amount, 'SGST (' + sgst.rate + '%) ' + sgst.amount]
        : ['CGST ' + cgst.amount + ' / SGST ' + sgst.amount]),
      'Bill total ' + bill.currency + ' ' + bill.totalAmount,
      ...(payment
        ? [
            ...(payment.tipAmount === '0.00' ? [] : ['Tip ' + payment.tipAmount]),
            ...(payment.tenders?.length
              ? [
                  ...payment.tenders.flatMap((tender) => [
                    tender.method + ' ' + bill.currency + ' ' + tender.amount,
                    ...(detailed && tender.referenceNumber
                      ? ['  Ref ' + tender.referenceNumber]
                      : []),
                  ]),
                  'Received ' + bill.currency + ' ' + payment.amount,
                ]
              : [
                  'Received ' + bill.currency + ' ' + payment.amount + ' (' + payment.method + ')',
                  ...(detailed && payment.referenceNumber
                    ? ['Reference ' + payment.referenceNumber]
                    : []),
                ]),
            ...(detailed && payment.paidAt ? ['Paid at ' + localDateTime(payment.paidAt)] : []),
          ]
        : []),
    ],
  };
}

export function sampleThermalReceipt(
  layout: ThermalTicketLayout,
  generatedAt: string,
): Pick<ThermalDocument, 'title' | 'lines'> {
  return formatThermalReceipt(
    {
      restaurant: { name: 'Sample restaurant', address: '12 Market Road', gstNumber: null },
      bill: {
        billNumber: 'INV-2026-000123',
        table: { tableNumber: '12' },
        status: 'PAID',
        generatedAt,
        timezone: 'Asia/Kolkata',
        subtotal: '450.00',
        discountAmount: '50.00',
        currency: 'INR',
        totalAmount: '420.00',
        lines: [
          { quantity: 2, name: 'Paneer tikka', unitPrice: '180.00', amount: '360.00' },
          { quantity: 1, name: 'Garlic naan', unitPrice: '90.00', amount: '90.00' },
        ],
      },
      cgst: { rate: '2.50', amount: '10.00' },
      sgst: { rate: '2.50', amount: '10.00' },
      payment: {
        method: 'UPI',
        tipAmount: '20.00',
        amount: '440.00',
        paidAt: generatedAt,
        referenceNumber: 'SAMPLE-123',
      },
    },
    layout,
  );
}

export const thermalConnectorStatusSchema = z
  .object({
    paired: z.boolean(),
    online: z.boolean(),
  })
  .strict();
export const thermalConnectorCredentialSchema = z.object({ token: z.string().length(43) }).strict();
export const thermalConnectorTargetSchema = z.discriminatedUnion('transport', [
  z.object({ transport: z.literal('network'), network: thermalNetworkSchema }).strict(),
  z.object({ transport: z.literal('usb'), device: thermalUsbDeviceSchema }).strict(),
]);
export const thermalConnectorCommandSchema = z
  .object({
    id: z.string().uuid(),
    target: thermalConnectorTargetSchema,
    expiresAt: z.number().int().positive(),
    data: z.string().optional(),
  })
  .strict();
export type ThermalConnectorTarget = z.infer<typeof thermalConnectorTargetSchema>;
export type ThermalConnectorCommand = z.infer<typeof thermalConnectorCommandSchema>;
export const thermalConnectorReplySchema = z
  .object({
    id: z.string().uuid(),
    ok: z.boolean(),
  })
  .strict();
export type ThermalConnectorStatus = z.infer<typeof thermalConnectorStatusSchema>;
export type ThermalConnectorReply = z.infer<typeof thermalConnectorReplySchema>;
