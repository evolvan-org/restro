import { Injectable, NotFoundException } from '@nestjs/common';
import type { TodaySummary } from '@rms/api-contract';

import type { Actor } from '../common/auth/authenticated-request';
import { DashboardRepository } from './dashboard.repository';

@Injectable()
export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async todaySummary(actor: Actor): Promise<TodaySummary> {
    const summary = await this.repository.todaySummary(actor.restaurantId);
    if (!summary) throw new NotFoundException('Restaurant not found');
    return summary;
  }
}
