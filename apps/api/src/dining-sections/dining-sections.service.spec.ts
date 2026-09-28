import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import {
  DiningSectionInUseError,
  type DiningSectionRecord,
  DiningSectionsRepository,
} from './dining-sections.repository';
import { DiningSectionsService } from './dining-sections.service';

const actor: Actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  restaurantId: '00000000-0000-4000-8000-000000000002',
  role: Role.OWNER,
};

const section: DiningSectionRecord = {
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Indoor',
  description: null,
  sortOrder: 0,
  isActive: true,
  createdAt: new Date('2026-09-28T00:00:00.000Z'),
  updatedAt: new Date('2026-09-28T00:00:00.000Z'),
};

describe('DiningSectionsService', () => {
  let repository: jest.Mocked<DiningSectionsRepository>;
  let service: DiningSectionsService;

  beforeEach(() => {
    repository = {
      findPage: jest.fn(),
      findById: jest.fn(),
      findIds: jest.fn(),
      isNameTaken: jest.fn(),
      nextSortOrder: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      reorder: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<DiningSectionsRepository>;
    service = new DiningSectionsService(repository);
  });

  it('lists only the actor restaurant in configured order', async () => {
    repository.findPage.mockResolvedValue({ items: [section], total: 1 });

    const result = await service.list(actor, { page: 1, pageSize: 20 });

    expect(repository.findPage).toHaveBeenCalledWith(actor.restaurantId, 0, 20);
    expect(result.data[0]?.name).toBe('Indoor');
    expect(result.meta.total).toBe(1);
  });

  it('places a new section at the end when sortOrder is omitted', async () => {
    repository.isNameTaken.mockResolvedValue(false);
    repository.nextSortOrder.mockResolvedValue(4);
    repository.create.mockResolvedValue({ ...section, sortOrder: 4 });

    const created = await service.create(actor, { name: 'Indoor', description: '' });

    expect(repository.create).toHaveBeenCalledWith(actor.restaurantId, {
      name: 'Indoor',
      description: null,
      sortOrder: 4,
    });
    expect(created.isActive).toBe(true);
  });

  it('rejects a duplicate name within the restaurant', async () => {
    repository.isNameTaken.mockResolvedValue(true);

    await expect(service.create(actor, { name: 'Indoor' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('does not expose a section from another restaurant', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      service.update(actor, section.id, { name: 'Patio', sortOrder: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('requires a complete, current section list before reordering', async () => {
    repository.findIds.mockResolvedValue([section.id, '00000000-0000-4000-8000-000000000004']);

    await expect(service.reorder(actor, { orderedIds: [section.id] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.reorder).not.toHaveBeenCalled();
  });

  it('updates every section order atomically through the repository', async () => {
    const secondId = '00000000-0000-4000-8000-000000000004';
    repository.findIds.mockResolvedValue([section.id, secondId]);
    repository.findPage.mockResolvedValue({
      items: [
        { ...section, id: secondId, sortOrder: 0 },
        { ...section, sortOrder: 1 },
      ],
      total: 2,
    });

    const result = await service.reorder(actor, { orderedIds: [secondId, section.id] });

    expect(repository.reorder).toHaveBeenCalledWith(actor.restaurantId, [secondId, section.id]);
    expect(result.map(({ id }) => id)).toEqual([secondId, section.id]);
  });

  it('suggests deactivation when an assigned section cannot be deleted', async () => {
    repository.findById.mockResolvedValue(section);
    repository.delete.mockRejectedValue(new DiningSectionInUseError());

    await expect(service.delete(actor, section.id)).rejects.toThrow('Deactivate it instead');
  });
});
