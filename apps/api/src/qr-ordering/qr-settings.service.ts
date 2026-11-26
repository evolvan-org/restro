import { randomBytes } from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  QR_DEFAULT_BRAND_COLOR,
  QR_MAX_UPI_IMAGE_BYTES,
  type QrSettings,
  type QrTableCard,
  type QrTableCardsResponse,
  type UpdateQrSettingsRequest,
  type UploadUpiQrRequest,
} from '@rms/api-contract';
import { contrastRatio, MIN_TEXT_CONTRAST, readableBrandColor } from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import { type QrSettingsRecord, QrStaffRepository } from './qr-staff.repository';
import { initials } from './qr-status';

/** First bytes of each accepted image type; the declared MIME type must match the content. */
const SIGNATURES: Record<UploadUpiQrRequest['mimeType'], (bytes: Buffer) => boolean> = {
  'image/png': (b) =>
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
};

/** A new table token: 256 random bits as 64 hex characters, never derived from the table. */
export function newQrToken(): string {
  return randomBytes(32).toString('hex');
}

@Injectable()
export class QrSettingsService {
  constructor(private readonly repository: QrStaffRepository) {}

  async get(actor: Actor): Promise<QrSettings> {
    return toSettings(await this.find(actor));
  }

  async update(actor: Actor, input: UpdateQrSettingsRequest): Promise<QrSettings> {
    if (input.brandColor) {
      const ratio = contrastRatio(input.brandColor, '#FFFFFF') ?? 0;
      if (ratio < MIN_TEXT_CONTRAST) {
        throw new BadRequestException({
          message: [
            `brandColor: White text on this colour is only ${ratio.toFixed(1)}:1. Pick a darker shade (4.5:1 or more).`,
          ],
        });
      }
    }
    await this.find(actor);
    return toSettings(
      await this.repository.updateSettings(actor.restaurantId, {
        qrOrderingEnabled: input.enabled,
        qrEscalationMinutes: input.escalationMinutes,
        guestPhone: input.guestPhone,
        brandColor: input.brandColor,
      }),
    );
  }

  async uploadUpiQr(actor: Actor, input: UploadUpiQrRequest): Promise<QrSettings> {
    const bytes = Buffer.from(input.data, 'base64');
    if (bytes.length === 0 || bytes.length > QR_MAX_UPI_IMAGE_BYTES) {
      throw new BadRequestException({ message: ['data: The image must be 1 MB or smaller'] });
    }
    if (!SIGNATURES[input.mimeType](bytes)) {
      throw new BadRequestException({
        message: ['data: Upload a PNG, JPEG or WebP image of your UPI QR code'],
      });
    }
    await this.repository.saveUpiQr(actor.restaurantId, input.mimeType, new Uint8Array(bytes));
    return this.get(actor);
  }

  async deleteUpiQr(actor: Actor): Promise<QrSettings> {
    await this.repository.deleteUpiQr(actor.restaurantId);
    return this.get(actor);
  }

  async upiQr(actor: Actor): Promise<{ mimeType: string; data: Buffer }> {
    const image = await this.repository.findUpiQr(actor.restaurantId);
    if (!image) throw new NotFoundException('No UPI QR code has been uploaded yet');
    return { mimeType: image.mimeType, data: Buffer.from(image.data) };
  }

  async cards(actor: Actor): Promise<QrTableCardsResponse> {
    const { restaurant, tables } = await this.repository.findCards(actor.restaurantId);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
    return {
      restaurant: {
        name: restaurant.name,
        initials: initials(restaurant.name),
        brandColor: readableBrandColor(restaurant.brandColor, QR_DEFAULT_BRAND_COLOR),
        guestPhone: restaurant.guestPhone,
        currency: restaurant.currency,
      },
      data: tables
        .sort(
          (a, b) =>
            a.section.sortOrder - b.section.sortOrder ||
            collator.compare(a.section.name, b.section.name) ||
            collator.compare(a.tableNumber, b.tableNumber),
        )
        .map(toCard),
    };
  }

  /** Regenerates a table's token: the old printed card shows "This QR code isn’t working". */
  async rotateToken(actor: Actor, tableId: string): Promise<QrTableCard> {
    if (!(await this.repository.rotateToken(actor.restaurantId, tableId, newQrToken()))) {
      throw new NotFoundException('Table not found');
    }
    const { tables } = await this.repository.findCards(actor.restaurantId);
    const table = tables.find((candidate) => candidate.id === tableId);
    if (!table) throw new NotFoundException('Table not found');
    return toCard(table);
  }

  private async find(actor: Actor): Promise<QrSettingsRecord> {
    const settings = await this.repository.findSettings(actor.restaurantId);
    if (!settings) throw new NotFoundException('Restaurant not found');
    return settings;
  }
}

function toSettings(record: QrSettingsRecord): QrSettings {
  return {
    enabled: record.qrOrderingEnabled,
    escalationMinutes: record.qrEscalationMinutes,
    guestPhone: record.guestPhone,
    brandColor: record.brandColor,
    hasUpiQr: record.upiQr !== null,
    upiQrUpdatedAt: record.upiQr?.updatedAt.toISOString() ?? null,
  };
}

function toCard(table: {
  id: string;
  tableNumber: string;
  isActive: boolean;
  qrToken: string;
  section: { name: string };
}): QrTableCard {
  return {
    tableId: table.id,
    tableNumber: table.tableNumber,
    section: table.section.name,
    isActive: table.isActive,
    token: table.qrToken,
  };
}
