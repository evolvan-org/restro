import { Injectable } from '@nestjs/common';
import {
  KOT_PRINT_ATTEMPT_TIMEOUT_MS,
  KOT_PRINT_QUEUE_TIMEOUT_MS,
  type ThermalDestination,
  type ThermalSettings,
} from '@rms/api-contract';
import type { ThermalPrinter } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';
import { type KotQueueRecord, kotQueueSelect } from '../orders/orders.repository';

@Injectable()
export class ThermalPrintingRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(restaurantId: string): Promise<ThermalPrinter[]> {
    return this.prisma.thermalPrinter.findMany({ where: { restaurantId } });
  }

  find(restaurantId: string, destination: ThermalDestination): Promise<ThermalPrinter | null> {
    return this.prisma.thermalPrinter.findUnique({
      where: { restaurantId_destination: { restaurantId, destination } },
    });
  }

  save(
    restaurantId: string,
    destination: ThermalDestination,
    settings: ThermalSettings,
  ): Promise<ThermalPrinter> {
    const { network, usbDevice, ticketLayout, autoPrint, ...profile } = settings;
    const fields = {
      ...profile,
      networkHost: network?.host ?? null,
      networkPort: network?.port ?? null,
      ...(usbDevice !== undefined && { usbDevice }),
      ...(ticketLayout !== undefined && { ticketLayout }),
      ...(autoPrint !== undefined && { autoPrint }),
    };
    return this.prisma.thermalPrinter.upsert({
      where: { restaurantId_destination: { restaurantId, destination } },
      create: { restaurantId, destination, ...fields },
      update: fields,
    });
  }
  findTicket(restaurantId: string, id: string): Promise<KotQueueRecord | null> {
    return this.prisma.kot.findFirst({ where: { id, restaurantId }, select: kotQueueSelect });
  }

  async claimTicketPrint(
    restaurantId: string,
    id: string,
    automatic: boolean,
  ): Promise<Date | null> {
    const startedAt = new Date();
    const queueCutoff = new Date(startedAt.getTime() - KOT_PRINT_QUEUE_TIMEOUT_MS);
    const attemptCutoff = new Date(startedAt.getTime() - KOT_PRINT_ATTEMPT_TIMEOUT_MS);
    const { count } = await this.prisma.kot.updateMany({
      where: {
        restaurantId,
        id,
        ...(automatic
          ? { printStatus: 'QUEUED', createdAt: { gt: queueCutoff } }
          : {
              OR: [
                { printStatus: null },
                { printStatus: { in: ['SENT', 'UNCONFIRMED'] } },
                { printStatus: 'QUEUED', createdAt: { lte: queueCutoff } },
                { printStatus: 'PRINTING', printAttemptAt: { lte: attemptCutoff } },
              ],
            }),
      },
      data: { printStatus: 'PRINTING', printAttemptAt: startedAt },
    });
    return count === 1 ? startedAt : null;
  }

  async finishTicketPrint(
    restaurantId: string,
    id: string,
    startedAt: Date,
    confirmed: boolean,
  ): Promise<void> {
    await this.prisma.kot.updateMany({
      where: { restaurantId, id, printStatus: 'PRINTING', printAttemptAt: startedAt },
      data: { printStatus: confirmed ? 'SENT' : 'UNCONFIRMED' },
    });
  }

  async connectorHash(restaurantId: string): Promise<string | null> {
    const record = await this.prisma.thermalPrintConnector.findUnique({
      where: { restaurantId },
      select: { tokenHash: true },
    });
    return record?.tokenHash ?? null;
  }

  connectorOwner(tokenHash: string): Promise<{ restaurantId: string } | null> {
    return this.prisma.thermalPrintConnector.findUnique({
      where: { tokenHash },
      select: { restaurantId: true },
    });
  }

  async setConnector(restaurantId: string, tokenHash: string | null): Promise<void> {
    await this.prisma.thermalPrintConnector.upsert({
      where: { restaurantId },
      create: { restaurantId, tokenHash },
      update: { tokenHash },
    });
  }
}
