import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import {
  TableStatusCodeConflictError,
  TableStatusesRepository,
  TableStatusInUseError,
  type TableStatusRecord,
} from './table-statuses.repository';
import { TableStatusesService } from './table-statuses.service';

const actor: Actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  restaurantId: '00000000-0000-4000-8000-000000000002',
  role: Role.OWNER,
};

const otherRestaurantId = '00000000-0000-4000-8000-000000000003';
const statusId = '00000000-0000-4000-8000-000000000004';
const secondStatusId = '00000000-0000-4000-8000-000000000005';
const now = new Date('2026-09-28T00:00:00.000Z');

function record(overrides: Partial<TableStatusRecord> = {}): TableStatusRecord {
  return {
    id: statusId,
    code: 'AVAILABLE',
    name: 'Available',
    sortOrder: 0,
    isSystem: true,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('TableStatusesService', () => {
  let repository: jest.Mocked<TableStatusesRepository>;
  let service: TableStatusesService;

  beforeEach(() => {
    repository = {
      findPage: jest.fn(),
      findById: jest.fn(),
      findIds: jest.fn(),
      nextSortOrder: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateActive: jest.fn(),
      reorder: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<TableStatusesRepository>;
    service = new TableStatusesService(repository);
  });

  it('lists only the actor tenant page and serializes timestamps', async () => {
    repository.findPage.mockResolvedValue({ items: [record()], total: 1 });

    const response = await service.list(actor, { page: 1, pageSize: 20 });

    expect(repository.findPage).toHaveBeenCalledWith(actor.restaurantId, 0, 20);
    expect(response.data[0]?.createdAt).toBe(now.toISOString());
    expect(response.meta.total).toBe(1);
  });

  it('creates a custom status at the end by default', async () => {
    repository.nextSortOrder.mockResolvedValue(4);
    repository.create.mockResolvedValue(
      record({ code: 'BLOCKED', name: 'Blocked', sortOrder: 4, isSystem: false }),
    );

    const response = await service.create(actor, { code: 'BLOCKED', name: 'Blocked' });

    expect(repository.nextSortOrder).toHaveBeenCalledWith(actor.restaurantId);
    expect(repository.create).toHaveBeenCalledWith(actor.restaurantId, {
      code: 'BLOCKED',
      name: 'Blocked',
      sortOrder: 4,
    });
    expect(response).toMatchObject({ isSystem: false, isActive: true });
  });

  it('maps duplicate codes to a conflict', async () => {
    repository.create.mockRejectedValue(new TableStatusCodeConflictError());

    await expect(
      service.create(actor, { code: 'AVAILABLE', name: 'Duplicate', sortOrder: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not expose a status from another tenant', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      service.update({ ...actor, restaurantId: otherRestaurantId }, statusId, {
        code: 'AVAILABLE',
        name: 'Open',
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not allow a system status code to change', async () => {
    repository.findById.mockResolvedValue(record());

    await expect(
      service.update(actor, statusId, { code: 'OPEN', name: 'Open', sortOrder: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('requires the complete current list for reordering', async () => {
    repository.findIds.mockResolvedValue([statusId, secondStatusId]);

    await expect(service.reorder(actor, { orderedIds: [statusId] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.reorder).not.toHaveBeenCalled();
  });

  it('persists a complete reorder and returns the new order', async () => {
    const second = record({ id: secondStatusId, code: 'OCCUPIED', name: 'Occupied' });
    repository.findIds.mockResolvedValue([statusId, secondStatusId]);
    repository.reorder.mockResolvedValue();
    repository.findPage.mockResolvedValue({
      items: [second, record({ sortOrder: 1 })],
      total: 2,
    });

    const response = await service.reorder(actor, {
      orderedIds: [secondStatusId, statusId],
    });

    expect(repository.reorder).toHaveBeenCalledWith(actor.restaurantId, [secondStatusId, statusId]);
    expect(response.map(({ id }) => id)).toEqual([secondStatusId, statusId]);
  });

  it('protects system statuses from deletion', async () => {
    repository.findById.mockResolvedValue(record());

    await expect(service.delete(actor, statusId)).rejects.toBeInstanceOf(ConflictException);
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('maps an assigned custom status deletion to a conflict', async () => {
    repository.findById.mockResolvedValue(record({ isSystem: false }));
    repository.delete.mockRejectedValue(new TableStatusInUseError());

    await expect(service.delete(actor, statusId)).rejects.toThrow('Deactivate it instead');
  });
});
