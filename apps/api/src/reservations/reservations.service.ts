import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  type CreateReservationRequest,
  type CreateWalkInRequest,
  type Guest,
  type GuestLookupQuery,
  type GuestLookupResponse,
  type Reservation,
  RESERVATION_DURATION_MINUTES,
  type ReservationListQuery,
  type ReservationListResponse,
} from '@rms/api-contract';
import { buildPageMeta } from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import {
  type GuestRecord,
  type ReservationRecord,
  ReservationsRepository,
  type WalkInDetails,
} from './reservations.repository';

@Injectable()
export class ReservationsService {
  constructor(private readonly repository: ReservationsRepository) {}

  async list(actor: Actor, query: ReservationListQuery): Promise<ReservationListResponse> {
    const { page, pageSize, status } = query;
    const { items, total } = await this.repository.findPage(actor.restaurantId, {
      status,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: items.map(toReservation),
      meta: buildPageMeta(page, pageSize, total),
    };
  }

  async lookupGuest(actor: Actor, query: GuestLookupQuery): Promise<GuestLookupResponse> {
    const guest = await this.repository.findGuestByPhone(actor.restaurantId, query.phoneNumber);
    return guest ? toGuest(guest) : null;
  }

  async createWalkIn(actor: Actor, input: CreateWalkInRequest): Promise<Reservation> {
    const created = await this.repository.createWalkIn(
      actor.restaurantId,
      actor.userId,
      toWalkInDetails(input),
    );
    return toReservation(created);
  }

  async create(actor: Actor, input: CreateReservationRequest): Promise<Reservation> {
    const result = await this.repository.createBooking(
      actor.restaurantId,
      actor.userId,
      {
        guestName: input.guestName,
        phoneNumber: input.phoneNumber,
        partySize: input.partySize,
        notes: input.notes || null,
        reservationAt: new Date(input.reservationAt),
        tableId: input.tableId ?? null,
      },
      RESERVATION_DURATION_MINUTES,
    );

    switch (result.outcome) {
      case 'CREATED':
        return toReservation(result.reservation);
      case 'TABLE_NOT_FOUND':
        throw new BadRequestException({ message: ['tableId: Table not found or inactive'] });
      case 'OVER_CAPACITY':
        throw new BadRequestException({
          message: ['partySize: Party size exceeds the capacity of the selected table'],
        });
      case 'CONFLICT':
        throw new ConflictException(
          `This table is already reserved within ${RESERVATION_DURATION_MINUTES} minutes of the requested time`,
        );
    }
  }
}

function toWalkInDetails(input: CreateWalkInRequest): WalkInDetails {
  return {
    guestName: input.guestName,
    phoneNumber: input.phoneNumber,
    partySize: input.partySize,
    notes: input.notes || null,
    reservationAt: new Date(),
  };
}

function toGuest(record: GuestRecord): Guest {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toReservation(record: ReservationRecord): Reservation {
  return {
    id: record.id,
    guestId: record.guestId,
    tableId: record.tableId,
    createdByUserId: record.createdByUserId,
    reservationAt: record.reservationAt.toISOString(),
    partySize: record.partySize,
    status: record.status,
    notes: record.notes,
    guest: toGuest(record.guest),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
