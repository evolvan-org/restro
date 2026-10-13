import { Injectable } from '@nestjs/common';
import type { StockItem } from '@rms/api-contract';

import type { Actor } from '../common/auth/authenticated-request';
import { StockItemsRepository } from './stock-items.repository';

@Injectable()
export class StockItemsService {
  constructor(private readonly repository: StockItemsRepository) {}

  list(actor: Actor): Promise<StockItem[]> {
    return this.repository.findActive(actor.restaurantId);
  }
}
