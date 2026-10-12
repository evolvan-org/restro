import { Injectable } from '@nestjs/common';
import type { GuestLookupQuery, GuestLookupResponse } from '@rms/api-contract';

import type { Actor } from '../../common/auth/authenticated-request';
import { toGuest } from './guests.mapper';
import { GuestsRepository } from './guests.repository';

@Injectable()
export class GuestsService {
  constructor(private readonly repository: GuestsRepository) {}

  async lookup(actor: Actor, query: GuestLookupQuery): Promise<GuestLookupResponse> {
    const guest = await this.repository.findByPhone(actor.restaurantId, query.phoneNumber);
    return guest ? toGuest(guest) : null;
  }
}
