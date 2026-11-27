import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
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
  thermalUsbDeviceSchema,
} from '@rms/api-contract';
import type { ThermalPrinter } from '@rms/db';
import { encode } from 'iconv-lite';

import { BillsService } from '../bills/bills.service';
import type { Actor } from '../common/auth/authenticated-request';
import { OrdersService } from '../orders/orders.service';
import { ThermalPrintConnectorService } from './thermal-print-connector.service';
import { ThermalPrintingRepository } from './thermal-printing.repository';

type Job = Pick<ThermalDocument, 'title' | 'lines'> & { destination: ThermalDestination };

@Injectable()
export class ThermalPrintingService {
  constructor(
    private readonly bills: BillsService,
    private readonly orders: OrdersService,
    private readonly connector: ThermalPrintConnectorService,
    private readonly repository: ThermalPrintingRepository,
  ) {}

  async preview(actor: Actor, kind: ThermalKind, id: string): Promise<ThermalDocument> {
    const { destination, ...document } = await this.job(actor, kind, id);
    const settings = await this.destinationSettings(actor, destination);
    const { connection, paper, codePage, columns } = settings;
    return {
      ...document,
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
    const record = await this.repository.save(actor.restaurantId, destination, input);
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
    return this.deliver(
      actor.restaurantId,
      {
        destination,
        title: 'RESTRO PRINTER TEST',
        lines: [
          destination + ' / ' + request.paper + ' mm / ' + settings.codePage,
          '1234567890'.repeat(8).slice(0, columns),
          'Accents: áéíóú ñ ü ¿? €',
          new Date().toISOString(),
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
    };
  }

  async print(
    actor: Actor,
    kind: ThermalKind,
    id: string,
    request: ThermalPrintRequest,
  ): Promise<{ message: string }> {
    const job = await this.job(actor, kind, id);
    return this.deliver(
      actor.restaurantId,
      job,
      request,
      await this.destinationSettings(actor, job.destination),
    );
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

  private async job(actor: Actor, kind: ThermalKind, id: string): Promise<Job> {
    let destination: ThermalDestination;
    let title: string;
    let lines: string[];
    if (kind === 'receipt') {
      const invoice = await this.bills.invoice(actor, id);
      const { bill, restaurant, payment } = invoice;
      destination = 'RECEIPT';
      title = restaurant.name;
      lines = [
        ...(restaurant.address ? [restaurant.address] : []),
        ...(restaurant.gstNumber ? ['GSTIN ' + restaurant.gstNumber] : []),
        bill.billNumber + ' / Table ' + bill.table.tableNumber,
        bill.status === 'PAID' ? 'PAID' : 'PROFORMA / UNPAID',
        new Date(bill.generatedAt).toLocaleString('en-IN', { timeZone: bill.timezone }),
        '',
        ...bill.lines.map((line) => line.quantity + ' x ' + line.name + '  ' + line.amount),
        '',
        'Subtotal ' + bill.subtotal,
        'Discount ' + bill.discountAmount,
        'CGST ' + invoice.cgst.amount + ' / SGST ' + invoice.sgst.amount,
        'Bill total ' + bill.currency + ' ' + bill.totalAmount,
        ...(payment
          ? [
              ...(payment.tipAmount === '0.00' ? [] : ['Tip ' + payment.tipAmount]),
              'Received ' + bill.currency + ' ' + payment.amount + ' (' + payment.method + ')',
            ]
          : []),
      ];
    } else {
      const ticket = await this.orders.printTicket(actor, id);
      destination = ticket.destination;
      title = destination + ' TICKET';
      lines = [
        ticket.kotNumber + ' / Table ' + ticket.table.tableNumber,
        new Date(ticket.createdAt).toISOString(),
        '',
        ...ticket.items.flatMap((item) => [
          item.quantity + ' x ' + item.name,
          ...(item.specialInstructions ? ['  ' + item.specialInstructions] : []),
        ]),
      ];
    }
    return { destination, title, lines };
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
