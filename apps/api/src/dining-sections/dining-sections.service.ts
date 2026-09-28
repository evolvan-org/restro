import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateDiningSectionRequest,
  type DiningSection,
  type DiningSectionListQuery,
  type DiningSectionListResponse,
  type ReorderDiningSectionsRequest,
  type UpdateDiningSectionRequest,
  type UpdateDiningSectionStatusRequest,
} from '@rms/api-contract';
import { buildPageMeta } from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import {
  type DiningSectionDetails,
  DiningSectionInUseError,
  type DiningSectionRecord,
  DiningSectionsRepository,
} from './dining-sections.repository';

const NAME_IN_USE_MESSAGE = 'A dining section with this name already exists';

@Injectable()
export class DiningSectionsService {
  constructor(private readonly repository: DiningSectionsRepository) {}

  async list(actor: Actor, query: DiningSectionListQuery): Promise<DiningSectionListResponse> {
    const { page, pageSize } = query;
    const { items, total } = await this.repository.findPage(
      actor.restaurantId,
      (page - 1) * pageSize,
      pageSize,
    );
    return {
      data: items.map(toDiningSection),
      meta: buildPageMeta(page, pageSize, total),
    };
  }

  async create(actor: Actor, input: CreateDiningSectionRequest): Promise<DiningSection> {
    await this.assertNameAvailable(actor.restaurantId, input.name);
    const sortOrder = input.sortOrder ?? (await this.repository.nextSortOrder(actor.restaurantId));
    const created = await this.repository.create(actor.restaurantId, toDetails(input, sortOrder));
    return toDiningSection(created);
  }

  async update(
    actor: Actor,
    sectionId: string,
    input: UpdateDiningSectionRequest,
  ): Promise<DiningSection> {
    await this.assertExists(actor.restaurantId, sectionId);
    await this.assertNameAvailable(actor.restaurantId, input.name, sectionId);
    const updated = await this.repository.update(
      actor.restaurantId,
      sectionId,
      toDetails(input, input.sortOrder),
    );
    if (!updated) throw new NotFoundException('Dining section not found');
    return toDiningSection(updated);
  }

  async updateStatus(
    actor: Actor,
    sectionId: string,
    input: UpdateDiningSectionStatusRequest,
  ): Promise<DiningSection> {
    const existing = await this.assertExists(actor.restaurantId, sectionId);
    if (existing.isActive === input.isActive) return toDiningSection(existing);

    const updated = await this.repository.updateStatus(
      actor.restaurantId,
      sectionId,
      input.isActive,
    );
    if (!updated) throw new NotFoundException('Dining section not found');
    return toDiningSection(updated);
  }

  async reorder(actor: Actor, input: ReorderDiningSectionsRequest): Promise<DiningSection[]> {
    const existingIds = await this.repository.findIds(actor.restaurantId);
    if (
      existingIds.length !== input.orderedIds.length ||
      existingIds.some((id) => !input.orderedIds.includes(id))
    ) {
      throw new BadRequestException(
        'The section list has changed. Refresh the page before reordering.',
      );
    }

    await this.repository.reorder(actor.restaurantId, input.orderedIds);
    const { items } = await this.repository.findPage(
      actor.restaurantId,
      0,
      input.orderedIds.length,
    );
    return items.map(toDiningSection);
  }

  async delete(actor: Actor, sectionId: string): Promise<void> {
    await this.assertExists(actor.restaurantId, sectionId);
    try {
      if (!(await this.repository.delete(actor.restaurantId, sectionId))) {
        throw new NotFoundException('Dining section not found');
      }
    } catch (error) {
      if (error instanceof DiningSectionInUseError) {
        throw new ConflictException(
          'This dining section is assigned to one or more tables. Deactivate it instead.',
        );
      }
      throw error;
    }
  }

  private async assertExists(
    restaurantId: string,
    sectionId: string,
  ): Promise<DiningSectionRecord> {
    const section = await this.repository.findById(restaurantId, sectionId);
    if (!section) throw new NotFoundException('Dining section not found');
    return section;
  }

  private async assertNameAvailable(
    restaurantId: string,
    name: string,
    excludeSectionId?: string,
  ): Promise<void> {
    if (await this.repository.isNameTaken(restaurantId, name, excludeSectionId)) {
      throw new ConflictException(NAME_IN_USE_MESSAGE);
    }
  }
}

function toDetails(
  input: CreateDiningSectionRequest | UpdateDiningSectionRequest,
  sortOrder: number,
): DiningSectionDetails {
  return {
    name: input.name,
    description: input.description || null,
    sortOrder,
  };
}

function toDiningSection(record: DiningSectionRecord): DiningSection {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
