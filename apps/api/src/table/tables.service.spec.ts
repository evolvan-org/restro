import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import type { TablesRepository } from './tables.repository';
import { TablesService } from './tables.service';

function actor(overrides: Partial<Actor>): Actor {
  return {
    userId: 'u1',
    restaurantId: 'r1',
    roleId: 'role1',
    role: 'Custom',
    isOwner: false,
    permissions: [Permission.FLOOR_READ],
    emailVerifiedAt: null,
    ...overrides,
  };
}

function setup() {
  const findActiveBoard = jest.fn().mockResolvedValue([]);
  const repository = {
    reconcileStatuses: jest.fn().mockResolvedValue(undefined),
    findActiveBoard,
  } as unknown as TablesRepository;
  return { service: new TablesService(repository), findActiveBoard };
}

describe('TablesService.board', () => {
  it('limits a captain-eligible caller to their assigned tables', async () => {
    const { service, findActiveBoard } = setup();
    await service.board(
      actor({ permissions: [Permission.FLOOR_READ, Permission.TABLE_BE_CAPTAIN] }),
    );
    expect(findActiveBoard).toHaveBeenCalledWith('r1', 'u1');
  });

  it('returns the whole floor to callers without the captain marker', async () => {
    const { service, findActiveBoard } = setup();
    await service.board(actor({}));
    expect(findActiveBoard).toHaveBeenCalledWith('r1', undefined);
  });

  it('does not scope the Owner, whose bypass never grants eligibility markers', async () => {
    const { service, findActiveBoard } = setup();
    await service.board(actor({ isOwner: true, permissions: [] }));
    expect(findActiveBoard).toHaveBeenCalledWith('r1', undefined);
  });
});

describe('TablesService table number uniqueness per section', () => {
  const existing = {
    id: 't1',
    tableNumber: 'T1',
    section: { id: 'indoor', name: 'Indoor' },
    capacity: 4,
    isActive: true,
    captainUserId: null,
    captain: null,
    reservations: [],
    orders: [],
    currentStatus: { id: 's1', code: 'AVAILABLE', name: 'Available' },
    statusChangedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function setupWrites(taken: (sectionId: string, number: string) => boolean) {
    const isTableNumberTaken = jest
      .fn()
      .mockImplementation((_r: string, sectionId: string, number: string) =>
        Promise.resolve(taken(sectionId, number)),
      );
    const create = jest.fn().mockResolvedValue({ ...existing });
    const update = jest.fn().mockResolvedValue({ ...existing });
    const repository = {
      isTableNumberTaken,
      create,
      update,
      findById: jest.fn().mockResolvedValue(existing),
      findSection: jest.fn().mockResolvedValue({ id: 'x', name: 'X' }),
      findDefaultStatus: jest.fn().mockResolvedValue({ id: 's1' }),
      findStatus: jest.fn().mockResolvedValue({ id: 's1' }),
      findActiveStatusByCode: jest.fn().mockResolvedValue({ id: 's1' }),
    } as unknown as TablesRepository;
    return { service: new TablesService(repository), isTableNumberTaken, create, update };
  }

  const owner = actor({ isOwner: true, permissions: [] });
  const createInput = { tableNumber: 'T1', capacity: 4, sectionId: 'patio' } as never;

  it('checks availability within the target section on create', async () => {
    const { service, isTableNumberTaken, create } = setupWrites(() => false);
    await service.create(owner, createInput);
    expect(isTableNumberTaken).toHaveBeenCalledWith('r1', 'patio', 'T1', undefined);
    expect(create).toHaveBeenCalled();
  });

  it('rejects a duplicate number in the same section with 409', async () => {
    const { service, create } = setupWrites(() => true);
    await expect(service.create(owner, createInput)).rejects.toThrow(
      'Table number is already in use in this section',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a rename that collides within the current section', async () => {
    const { service, isTableNumberTaken, update } = setupWrites(() => true);
    await expect(service.update(owner, 't1', { tableNumber: 'T2' } as never)).rejects.toThrow(
      'Table number is already in use in this section',
    );
    expect(isTableNumberTaken).toHaveBeenCalledWith('r1', 'indoor', 'T2', 't1');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects moving a table to a section that already has the number', async () => {
    const { service, isTableNumberTaken, update } = setupWrites(
      (sectionId, number) => sectionId === 'patio' && number === 'T1',
    );
    await expect(service.update(owner, 't1', { sectionId: 'patio' } as never)).rejects.toThrow(
      'Table number is already in use in this section',
    );
    expect(isTableNumberTaken).toHaveBeenCalledWith('r1', 'patio', 'T1', 't1');
    expect(update).not.toHaveBeenCalled();
  });

  it('allows moving to a section where the number is free', async () => {
    const { service, update } = setupWrites(() => false);
    await service.update(owner, 't1', { sectionId: 'patio' } as never);
    expect(update).toHaveBeenCalled();
  });

  it('skips the check when neither number nor section changes', async () => {
    const { service, isTableNumberTaken } = setupWrites(() => true);
    await service.update(owner, 't1', { capacity: 6 } as never);
    expect(isTableNumberTaken).not.toHaveBeenCalled();
  });
});
