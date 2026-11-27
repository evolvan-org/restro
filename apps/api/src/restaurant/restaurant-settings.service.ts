import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  RestaurantSettingsResponse,
  UpdateRestaurantSettingsRequest,
} from '@rms/api-contract';

import type { Actor } from '../common/auth/authenticated-request';
import {
  type RestaurantSettingsRecord,
  RestaurantSettingsRepository,
} from './restaurant-settings.repository';

@Injectable()
export class RestaurantSettingsService {
  constructor(private readonly repository: RestaurantSettingsRepository) {}

  async get(actor: Actor): Promise<RestaurantSettingsResponse> {
    const settings = await this.repository.findById(actor.restaurantId);
    return toResponse(settings);
  }

  async update(
    actor: Actor,
    input: UpdateRestaurantSettingsRequest,
  ): Promise<RestaurantSettingsResponse> {
    if (input.targetFoodCostMin !== undefined || input.targetFoodCostMax !== undefined) {
      const current = await this.repository.findById(actor.restaurantId);
      const min = input.targetFoodCostMin ?? current?.targetFoodCostMin.toNumber() ?? 30;
      const max = input.targetFoodCostMax ?? current?.targetFoodCostMax.toNumber() ?? 35;
      if (min > max) {
        throw new BadRequestException('The lower food-cost target must not exceed the upper one');
      }
    }
    const settings = await this.repository.update(actor.restaurantId, input);
    return toResponse(settings);
  }
}

function toResponse(settings: RestaurantSettingsRecord | null): RestaurantSettingsResponse {
  if (!settings) throw new NotFoundException('Restaurant not found');

  return {
    ...settings,
    defaultGstRate: settings.defaultGstRate.toNumber(),
    maxDiscountPercent: settings.maxDiscountPercent.toNumber(),
    targetFoodCostMin: settings.targetFoodCostMin.toNumber(),
    targetFoodCostMax: settings.targetFoodCostMax.toNumber(),
  };
}
