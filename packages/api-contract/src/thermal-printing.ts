import { z } from 'zod';

export const thermalDestinations = ['RECEIPT', 'KITCHEN', 'BAR'] as const;
export const thermalDestinationSchema = z.enum(thermalDestinations);
export const thermalKindSchema = z.enum(['receipt', 'ticket']);
export const thermalPaperSchema = z.enum(['58', '80']);
export const thermalTransportSchema = z.enum(['network', 'usb']);
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
