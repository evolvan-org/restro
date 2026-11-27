import { constants } from 'node:fs';
import { access, lstat, open } from 'node:fs/promises';
import { createConnection } from 'node:net';

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type ThermalConfiguration,
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
} from '@rms/api-contract';
import type { ThermalPrinter } from '@rms/db';
import { encode } from 'iconv-lite';

import { BillsService } from '../bills/bills.service';
import type { Actor } from '../common/auth/authenticated-request';
import { OrdersService } from '../orders/orders.service';
import { ThermalPrintingRepository } from './thermal-printing.repository';

type Job = Pick<ThermalDocument, 'title' | 'lines'> & { destination: ThermalDestination };

@Injectable()
export class ThermalPrintingService {
  private readonly logger = new Logger(ThermalPrintingService.name);
  private readonly busy = new Set<string>();

  constructor(
    private readonly bills: BillsService,
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
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
        actor,
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
    return this.configuration(actor, destination, record);
  }

  async check(
    actor: Actor,
    destination: ThermalDestination,
    transport: ThermalPrintRequest['transport'],
  ): Promise<{ message: string }> {
    const settings = await this.destinationSettings(actor, destination);
    const address = this.target(settings, transport);
    if (!address)
      throw new ServiceUnavailableException('No printer is configured for this connection');
    try {
      if (transport === 'usb') {
        if (!(await lstat(address)).isCharacterDevice())
          throw new Error('USB printer is unavailable');
        await access(address, constants.W_OK);
      } else {
        await checkNetwork(address);
      }
    } catch {
      throw new ServiceUnavailableException('The API host could not reach this printer');
    }
    return {
      message:
        transport === 'usb'
          ? 'USB device is accessible on the API host'
          : 'Printer network port is reachable',
    };
  }

  async test(
    actor: Actor,
    { destination, ...request }: ThermalTestRequest,
  ): Promise<{ message: string }> {
    const settings = await this.destinationSettings(actor, destination);
    const columns = printColumns(request, settings);
    return this.deliver(
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
      actor,
      destination,
      await this.repository.find(actor.restaurantId, destination),
    );
  }

  private allowedTargets(actor: Actor, destination: ThermalDestination): Set<string> {
    if (this.config.get<string>('THERMAL_PRINTER_RESTAURANT_ID') !== actor.restaurantId)
      return new Set();
    const entries = (this.config.get<string>('THERMAL_NETWORK_TARGETS') ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const endpoint = this.config.get<string>('THERMAL_' + destination + '_NETWORK');
    if (endpoint) entries.push(endpoint);
    return new Set(
      entries.map((entry) => {
        const [host, port] = entry.split(':');
        return host + ':' + Number(port);
      }),
    );
  }

  private configuration(
    actor: Actor,
    destination: ThermalDestination,
    record: ThermalPrinter | null,
  ): ThermalConfiguration {
    const assigned =
      this.config.get<string>('THERMAL_PRINTER_RESTAURANT_ID') === actor.restaurantId;
    const defaultTarget = assigned
      ? this.config.get<string>('THERMAL_' + destination + '_NETWORK')
      : undefined;
    const usbDevice = assigned
      ? (this.config.get<string>('THERMAL_' + destination + '_USB') ?? null)
      : null;
    const [host, port] = defaultTarget?.split(':') ?? [];
    const network = thermalNetworkSchema.safeParse(
      record
        ? { host: record.networkHost, port: record.networkPort }
        : { host, port: Number(port) },
    );
    const savedNetwork = network.success ? network.data : null;
    const allowed = this.allowedTargets(actor, destination);
    const transports: ThermalConfiguration['transports'] = [];
    if (usbDevice) transports.push('usb');
    if (savedNetwork && allowed.has(addressOf(savedNetwork))) transports.push('network');
    const calibration = thermalProfileSchema.parse({
      connection: record?.connection ?? (usbDevice ? 'usb' : defaultTarget ? 'network' : 'usb'),
      paper: record?.paper ?? '80',
      codePage: record?.codePage ?? 'ASCII',
      columns: record?.columns ?? null,
    });
    return {
      ...calibration,
      destination,
      network: savedNetwork,
      usbDevice,
      transports,
      hasApprovedNetworkTargets: allowed.size > 0,
    };
  }

  async print(
    actor: Actor,
    kind: ThermalKind,
    id: string,
    request: ThermalPrintRequest,
  ): Promise<{ message: string }> {
    const job = await this.job(actor, kind, id);
    return this.deliver(job, request, await this.destinationSettings(actor, job.destination));
  }

  private async deliver(
    job: Job,
    request: ThermalPrintRequest,
    settings: ThermalConfiguration,
  ): Promise<{ message: string }> {
    const address = this.target(settings, request.transport);
    if (!address)
      throw new ServiceUnavailableException(
        'This printer connection is not configured for this station',
      );
    const key = request.transport + ':' + address;
    if (this.busy.has(key))
      throw new ServiceUnavailableException(
        'The printer is busy. Try again once the current job finishes.',
      );
    this.busy.add(key);
    try {
      const data = escPos(job, request, settings);
      if (request.transport === 'network') await writeNetwork(address, data);
      else {
        const device = await open(
          address,
          constants.O_WRONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
        );
        try {
          if (!(await device.stat()).isCharacterDevice())
            throw new Error('USB printer path is not a character device');
          await device.writeFile(data);
        } finally {
          await device.close();
        }
      }
      return { message: 'Sent to the printer' };
    } catch {
      this.logger.warn('Thermal print delivery could not be confirmed for ' + job.destination);
      throw new ServiceUnavailableException(
        'Printer delivery could not be confirmed. Check the printer before sending a copy.',
      );
    } finally {
      this.busy.delete(key);
    }
  }

  private target(
    settings: ThermalConfiguration,
    transport: ThermalPrintRequest['transport'],
  ): string | undefined {
    if (!settings.transports.includes(transport)) return undefined;
    return transport === 'usb'
      ? (settings.usbDevice ?? undefined)
      : settings.network
        ? addressOf(settings.network)
        : undefined;
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

function addressOf(target: NonNullable<ThermalSettings['network']>): string {
  return target.host + ':' + target.port;
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

function checkNetwork(address: string): Promise<void> {
  const [host, port] = address.split(':');
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port: Number(port) });
    socket.setTimeout(2500);
    socket.once('error', reject);
    socket.once('timeout', () => socket.destroy(new Error('Printer connection timed out')));
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
  });
}

function writeNetwork(address: string, data: Buffer): Promise<void> {
  const [host, port] = address.split(':');
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port: Number(port) });
    socket.setTimeout(4500);
    socket.once('error', reject);
    socket.once('timeout', () => socket.destroy(new Error('Printer connection timed out')));
    socket.once('connect', () => socket.end(data));
    socket.once('close', (hadError) => {
      if (!hadError) resolve();
    });
  });
}
