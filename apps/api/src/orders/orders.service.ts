import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVE_RESERVATION_STATUSES,
  type CreateOrderRequest,
  type Order,
} from '@rms/api-contract';

import type { Actor } from '../common/auth/authenticated-request';
import { toOrder } from './orders.mapper';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  constructor(private readonly repository: OrdersRepository) {}

  async create(actor: Actor, input: CreateOrderRequest): Promise<Order> {
    const record = await this.repository.withLockedTable(
      actor.restaurantId,
      input.tableId,
      input.reservationId,
      async ({ table, reservation, existingOrder, create }) => {
        if (!table) throw new NotFoundException('Table not found');
        if (input.reservationId && !reservation) {
          throw new NotFoundException('Reservation not found');
        }
        if (!table.isActive) throw new BadRequestException('Table is inactive');
        if (
          reservation &&
          (reservation.tableId !== table.id ||
            !ACTIVE_RESERVATION_STATUSES.some((status) => status === reservation.status))
        ) {
          throw new BadRequestException('Reservation must be active and assigned to this table');
        }
        if (existingOrder) {
          throw new ConflictException({
            message: 'This table already has an open order',
            error: 'Conflict',
            existingOrder: toOrder(existingOrder),
          });
        }
        return create({
          createdByUserId: actor.userId,
          reservationId: input.reservationId ?? null,
          status: 'OPEN',
          openedAt: new Date(),
        });
      },
    );
    return toOrder(record);
  }

  async current(actor: Actor, tableId: string): Promise<Order> {
    const record = await this.repository.findCurrent(actor.restaurantId, tableId);
    if (!record) throw new NotFoundException('No open order for this table');
    return toOrder(record);
  }
}
