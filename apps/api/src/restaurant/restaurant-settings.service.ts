import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  RestaurantLogoResponse,
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

  async logo(actor: Actor): Promise<RestaurantLogoResponse> {
    const record = await this.repository.findLogo(actor.restaurantId);
    if (!record?.data || !record.mimeType) return { logo: null };
    const mimeType = record.mimeType;
    if (mimeType !== 'image/png' && mimeType !== 'image/jpeg' && mimeType !== 'image/webp')
      return { logo: null };
    return { logo: { mimeType, data: Buffer.from(record.data).toString('base64') } };
  }

  async setLogo(actor: Actor, input: RestaurantLogoResponse): Promise<RestaurantLogoResponse> {
    if (!input.logo) {
      await this.repository.saveLogo(actor.restaurantId, null, null);
      return input;
    }
    const { data, mimeType } = input.logo;
    const image = Buffer.from(data, 'base64');
    const header = image.subarray(0, 12);
    const valid =
      mimeType === 'image/png'
        ? header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        : mimeType === 'image/jpeg'
          ? header.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
          : header.subarray(0, 4).toString() === 'RIFF' &&
            header.subarray(8, 12).toString() === 'WEBP';
    if (
      !valid ||
      image.length > 512_000 ||
      image.length < 16 ||
      image.toString('base64') !== data
    ) {
      throw new BadRequestException('Choose a PNG, JPEG or WebP image under 512 KB');
    }
    await this.repository.saveLogo(actor.restaurantId, mimeType, image);
    return input;
  }

  async get(actor: Actor): Promise<RestaurantSettingsResponse> {
    const settings = await this.repository.findById(actor.restaurantId);
    return toResponse(settings);
  }

  async update(
    actor: Actor,
    input: UpdateRestaurantSettingsRequest,
  ): Promise<RestaurantSettingsResponse> {
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
  };
}
