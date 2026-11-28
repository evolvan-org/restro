import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  formatThermalReceipt,
  formatThermalTicket,
  sampleThermalReceipt,
  sampleThermalTicket,
  type ThermalConfiguration,
  type ThermalConnectorTarget,
  type ThermalDestination,
  thermalDestinations,
  type ThermalDocument,
  type ThermalKind,
  thermalNetworkSchema,
  type ThermalPrinterStatus,
  type ThermalPrintRequest,
  thermalProfileSchema,
  type ThermalSettings,
  type ThermalTestRequest,
  thermalTicketLayoutSchema,
  thermalUsbDeviceSchema,
} from '@rms/api-contract';
import type { ThermalPrinter } from '@rms/db';
import { encode } from 'iconv-lite';

import { BillsService } from '../bills/bills.service';
import type { Actor } from '../common/auth/authenticated-request';
import { toKotQueueItem } from '../orders/orders.mapper';
import { ThermalPrintConnectorService } from './thermal-print-connector.service';
import { ThermalPrintingRepository } from './thermal-printing.repository';

type Job = Pick<ThermalDocument, 'title' | 'lines'> & { destination: ThermalDestination };

@Injectable()
export class ThermalPrintingService {
  private readonly logger = new Logger(ThermalPrintingService.name);
  private readonly automaticQueue = new Map<string, Promise<void>>();

  constructor(
    private readonly bills: BillsService,
    private readonly connector: ThermalPrintConnectorService,
    private readonly repository: ThermalPrintingRepository,
  ) {}

  async preview(actor: Actor, kind: ThermalKind, id: string): Promise<ThermalDocument> {
    const {
      job: { title, lines },
      settings,
    } = await this.load(actor, kind, id);
    const { connection, paper, codePage, columns } = settings;
    return {
      title,
      lines,
      transport: settings.transports,
      profile: { connection, paper, codePage, columns },
    };
  }

  async status(actor: Actor): Promise<ThermalPrinterStatus> {
    const records = await this.repository.list(actor.restaurantId);
    return thermalDestinations.map((destination) =>
      this.configuration(
        destination,
        records.find((record) => record.destination === destination) ?? null,
      ),
    );
  }

  async save(
    actor: Actor,
    destination: ThermalDestination,
    input: ThermalSettings,
  ): Promise<ThermalConfiguration> {
    const isStation = destination !== 'RECEIPT';
    const current = isStation ? await this.repository.find(actor.restaurantId, destination) : null;
    const autoPrint = isStation && (input.autoPrint ?? current?.autoPrint ?? false);
    const usbDevice =
      input.usbDevice === undefined ? (current?.usbDevice ?? undefined) : input.usbDevice;
    if (autoPrint && input.connection === 'network' && !input.network)
      throw new BadRequestException('Enter a network address before enabling print on send');
    if (autoPrint && input.connection === 'usb' && !usbDevice)
      throw new BadRequestException('Enter a USB printer device before enabling print on send');
    const record = await this.repository.save(actor.restaurantId, destination, {
      ...input,
      usbDevice,
      autoPrint,
    });
    return this.configuration(destination, record);
  }

  async check(
    actor: Actor,
    destination: ThermalDestination,
    transport: ThermalPrintRequest['transport'],
  ): Promise<{ message: string }> {
    const settings = await this.destinationSettings(actor, destination);
    await this.connector.dispatch(actor.restaurantId, this.target(settings, transport));
    return {
      message:
        transport === 'usb'
          ? 'USB printer is accessible to the connector'
          : 'Printer network port is reachable from the connector',
    };
  }

  async test(
    actor: Actor,
    { destination, ...request }: ThermalTestRequest,
  ): Promise<{ message: string }> {
    const settings = await this.destinationSettings(actor, destination);
    const columns = printColumns(request, settings);
    const now = new Date().toISOString();
    const sample =
      destination === 'RECEIPT'
        ? sampleThermalReceipt(settings.ticketLayout, now)
        : sampleThermalTicket(destination, settings.ticketLayout, now);
    return this.deliver(
      actor.restaurantId,
      {
        destination,
        title: 'RESTRO PRINTER TEST',
        lines: [
          sample.title,
          ...sample.lines,
          '',
          destination + ' / ' + request.paper + ' mm / ' + settings.codePage,
          '1234567890'.repeat(8).slice(0, columns),
          'Accents: áéíóú ñ ü ¿? €',
          now,
        ],
      },
      request,
      settings,
    );
  }

  private async destinationSettings(
    actor: Actor,
    destination: ThermalDestination,
  ): Promise<ThermalConfiguration> {
    return this.configuration(
      destination,
      await this.repository.find(actor.restaurantId, destination),
    );
  }

  private configuration(
    destination: ThermalDestination,
    record: ThermalPrinter | null,
  ): ThermalConfiguration {
    const network = thermalNetworkSchema.safeParse({
      host: record?.networkHost,
      port: record?.networkPort,
    });
    const device = thermalUsbDeviceSchema.safeParse(record?.usbDevice);
    const transports: ThermalConfiguration['transports'] = [];
    if (device.success) transports.push('usb');
    if (network.success) transports.push('network');
    const calibration = thermalProfileSchema.parse({
      connection: record?.connection ?? 'usb',
      paper: record?.paper ?? '80',
      codePage: record?.codePage ?? 'ASCII',
      columns: record?.columns ?? null,
    });
    return {
      ...calibration,
      destination,
      network: network.success ? network.data : null,
      usbDevice: device.success ? device.data : null,
      transports,
      ticketLayout: thermalTicketLayoutSchema.parse(record?.ticketLayout ?? 'STANDARD'),
      autoPrint: destination !== 'RECEIPT' && (record?.autoPrint ?? false),
    };
  }

  async print(
    actor: Actor,
    kind: ThermalKind,
    id: string,
    request: ThermalPrintRequest,
  ): Promise<{ message: string }> {
    const { job, settings } = await this.load(actor, kind, id);
    if (kind === 'receipt') return this.deliver(actor.restaurantId, job, request, settings);
    this.target(settings, request.transport);
    const started = await this.repository.claimTicketPrint(actor.restaurantId, id, false);
    if (!started) throw new ConflictException('This ticket already has a print in progress');
    await this.sendStationTicket(actor.restaurantId, id, started, job, request, settings);
    return { message: 'Sent to the printer' };
  }

  scheduleAutomatic(restaurantId: string, ticketIds: readonly string[]): void {
    if (ticketIds.length === 0) return;
    const previous = this.automaticQueue.get(restaurantId) ?? Promise.resolve();
    const pending = previous.then(async () => {
      for (const id of ticketIds) {
        try {
          const started = await this.repository.claimTicketPrint(restaurantId, id, true);
          if (!started) continue;
          const { job, settings } = await this.loadStationTicket(restaurantId, id);
          if (!settings.autoPrint) {
            await this.repository.finishTicketPrint(restaurantId, id, started, false);
            continue;
          }
          await this.sendStationTicket(
            restaurantId,
            id,
            started,
            job,
            {
              paper: settings.paper,
              transport: settings.connection,
            },
            settings,
          );
        } catch {
          this.logger.warn('Automatic ticket print was not confirmed for ticket ' + id);
        }
      }
    });
    this.automaticQueue.set(restaurantId, pending);
    void pending.finally(() => {
      if (this.automaticQueue.get(restaurantId) === pending)
        this.automaticQueue.delete(restaurantId);
    });
  }

  private async sendStationTicket(
    restaurantId: string,
    id: string,
    started: Date,
    job: Job,
    request: ThermalPrintRequest,
    settings: ThermalConfiguration,
  ): Promise<void> {
    try {
      await this.deliver(restaurantId, job, request, settings);
    } catch (error) {
      await this.repository.finishTicketPrint(restaurantId, id, started, false);
      throw error;
    }
    await this.repository.finishTicketPrint(restaurantId, id, started, true);
  }

  private async deliver(
    restaurantId: string,
    job: Job,
    request: ThermalPrintRequest,
    settings: ThermalConfiguration,
  ): Promise<{ message: string }> {
    await this.connector.dispatch(
      restaurantId,
      this.target(settings, request.transport),
      escPos(job, request, settings),
    );
    return { message: 'Sent to the printer' };
  }

  private target(
    settings: ThermalConfiguration,
    transport: ThermalPrintRequest['transport'],
  ): ThermalConnectorTarget {
    if (transport === 'usb' && settings.usbDevice) return { transport, device: settings.usbDevice };
    if (transport === 'network' && settings.network)
      return { transport, network: settings.network };
    throw new ServiceUnavailableException('No printer is configured for this connection');
  }

  private async loadStationTicket(
    restaurantId: string,
    id: string,
  ): Promise<{
    job: Job;
    settings: ThermalConfiguration;
  }> {
    const record = await this.repository.findTicket(restaurantId, id);
    if (!record) throw new NotFoundException('KOT not found');
    const ticket = toKotQueueItem(record);
    const settings = this.configuration(
      ticket.destination,
      await this.repository.find(restaurantId, ticket.destination),
    );
    return {
      job: {
        destination: ticket.destination,
        ...formatThermalTicket(ticket, settings.ticketLayout),
      },
      settings,
    };
  }

  private async load(
    actor: Actor,
    kind: ThermalKind,
    id: string,
  ): Promise<{
    job: Job;
    settings: ThermalConfiguration;
  }> {
    if (kind === 'ticket') return this.loadStationTicket(actor.restaurantId, id);
    const [invoice, settings] = await Promise.all([
      this.bills.invoice(actor, id),
      this.destinationSettings(actor, 'RECEIPT'),
    ]);
    return {
      job: { destination: 'RECEIPT', ...formatThermalReceipt(invoice, settings.ticketLayout) },
      settings,
    };
  }
}

function printColumns(request: ThermalPrintRequest, settings: ThermalConfiguration): number {
  return (
    (request.paper === settings.paper ? settings.columns : null) ??
    (request.paper === '58' ? 32 : 48)
  );
}

function escPos(
  document: Job,
  request: ThermalPrintRequest,
  settings: ThermalConfiguration,
): Buffer {
  const columns = printColumns(request, settings);
  const table = { ASCII: 0, CP437: 0, CP858: 19 }[settings.codePage];
  const output: Buffer[] = [Buffer.from([0x1b, 0x40, 0x1b, 0x74, table])];
  for (const line of [document.title, ...(request.copy ? ['COPY'] : []), ...document.lines]) {
    const printable = line.replace(/\p{Cc}/gu, ' ');
    const bytes =
      settings.codePage === 'ASCII'
        ? Buffer.from(
            printable
              .normalize('NFKD')
              .replace(/\p{Mark}/gu, '')
              .replace(/[^\x20-\x7e]/gu, '?'),
            'ascii',
          )
        : encode(printable, settings.codePage);
    for (let offset = 0; offset < bytes.length; offset += columns) {
      output.push(bytes.subarray(offset, offset + columns));
      if (offset + columns < bytes.length) output.push(Buffer.from('\n'));
    }
    output.push(Buffer.from('\n'));
  }
  output.push(Buffer.from([0x0a, 0x0a, 0x1d, 0x56, 0x01]));
  return Buffer.concat(output);
}
