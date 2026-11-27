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
    host: z.string().trim().ip({ version: 'v4', message: 'Enter an IPv4 address' }),
    port: z.number().int().min(1).max(65535),
  })
  .strict();
export const thermalSettingsSchema = thermalProfileSchema.extend({
  network: thermalNetworkSchema.nullable(),
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
  hasApprovedNetworkTargets: z.boolean(),
  usbDevice: z.string().nullable(),
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
