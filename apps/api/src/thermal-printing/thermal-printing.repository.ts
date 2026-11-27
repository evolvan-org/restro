import { Injectable } from '@nestjs/common';
import type { ThermalDestination, ThermalSettings } from '@rms/api-contract';
import type { ThermalPrinter } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

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
    const { network, ...profile } = settings;
    const fields = {
      ...profile,
      networkHost: network?.host ?? null,
      networkPort: network?.port ?? null,
    };
    return this.prisma.thermalPrinter.upsert({
      where: { restaurantId_destination: { restaurantId, destination } },
      create: { restaurantId, destination, ...fields },
      update: fields,
    });
  }
}
