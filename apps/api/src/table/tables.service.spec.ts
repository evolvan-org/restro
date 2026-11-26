import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import type { QrRealtimePublisher } from '../notifications/qr-realtime.publisher';
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
  const qrRealtime = { publish: jest.fn() } as unknown as QrRealtimePublisher;
  return { service: new TablesService(repository, qrRealtime), findActiveBoard };
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
      findOpenQrSessionIds: jest.fn().mockResolvedValue([]),
    } as unknown as TablesRepository;
    const qrRealtime = { publish: jest.fn() } as unknown as QrRealtimePublisher;
    return {
      service: new TablesService(repository, qrRealtime),
      isTableNumberTaken,
      create,
      update,
    };
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

describe('TablesService.assignCaptains', () => {
  const captainRole = {
    name: 'Captain',
    isOwner: false,
    permissions: [{ permissionKey: Permission.TABLE_BE_CAPTAIN }],
  };
  const captain = {
    id: 'c1',
    restaurantId: 'r1',
    name: 'Raj K',
    status: 'ACTIVE',
    role: captainRole,
  };

  function record(id: string, captainUserId: string | null) {
    return {
      id,
      tableNumber: id.toUpperCase(),
      section: { id: 'indoor', name: 'Indoor' },
      capacity: 4,
      isActive: true,
      captainUserId,
      captain: captainUserId ? { id: captainUserId, name: 'Raj K', role: captainRole } : null,
      reservations: [],
      orders: [],
      currentStatus: { id: 's1', code: 'AVAILABLE', name: 'Available' },
      statusChangedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  function setupBulk(options: {
    candidate?: unknown;
    result?: { appliedIds: string[]; conflictIds: string[] } | null;
    records?: ReturnType<typeof record>[];
  }) {
    const updateCaptainsIfCurrent = jest
      .fn()
      .mockResolvedValue(
        options.result === undefined ? { appliedIds: [], conflictIds: [] } : options.result,
      );
    const findOpenQrSessionIds = jest.fn().mockResolvedValue([]);
    const repository = {
      findCaptainCandidate: jest
        .fn()
        .mockResolvedValue(options.candidate === undefined ? captain : options.candidate),
      updateCaptainsIfCurrent,
      findByIds: jest.fn().mockResolvedValue(options.records ?? []),
      findOpenQrSessionIds,
    } as unknown as TablesRepository;
    const qrRealtime = { publish: jest.fn() } as unknown as QrRealtimePublisher;
    return {
      service: new TablesService(repository, qrRealtime),
      updateCaptainsIfCurrent,
      findOpenQrSessionIds,
    };
  }

  const manager = actor({ permissions: [Permission.TABLE_ASSIGN_CAPTAIN] });
  const input = {
    assignments: [
      {
        captainUserId: 'c1',
        tables: [
          { tableId: 't1', expectedCaptainUserId: null },
          { tableId: 't2', expectedCaptainUserId: null },
        ],
      },
    ],
  };

  it('returns applied tables as updated and changed-elsewhere tables as conflicts', async () => {
    const { service, updateCaptainsIfCurrent, findOpenQrSessionIds } = setupBulk({
      result: { appliedIds: ['t1'], conflictIds: ['t2'] },
      records: [record('t1', 'c1'), record('t2', 'c2')],
    });

    const result = await service.assignCaptains(manager, input);

    expect(updateCaptainsIfCurrent).toHaveBeenCalledWith('r1', input.assignments);
    expect(result.updated.map((t) => t.id)).toEqual(['t1']);
    expect(result.conflicts.map((t) => [t.id, t.captainUserId])).toEqual([['t2', 'c2']]);
    // Only applied tables are announced to QR screens.
    expect(findOpenQrSessionIds).toHaveBeenCalledTimes(1);
    expect(findOpenQrSessionIds).toHaveBeenCalledWith('r1', 't1');
  });

  it('clears captains without an eligibility lookup', async () => {
    const { service, updateCaptainsIfCurrent } = setupBulk({ candidate: null });
    const clear = {
      assignments: [
        { captainUserId: null, tables: [{ tableId: 't1', expectedCaptainUserId: 'c1' }] },
      ],
    };
    await service.assignCaptains(manager, clear);
    expect(updateCaptainsIfCurrent).toHaveBeenCalledWith('r1', clear.assignments);
  });

  it('rejects a captain whose role lacks the captain marker, changing nothing', async () => {
    const { service, updateCaptainsIfCurrent } = setupBulk({
      candidate: { ...captain, role: { ...captainRole, permissions: [] } },
    });
    await expect(service.assignCaptains(manager, input)).rejects.toThrow(BadRequestException);
    expect(updateCaptainsIfCurrent).not.toHaveBeenCalled();
  });

  it('rejects an inactive captain', async () => {
    const { service } = setupBulk({ candidate: { ...captain, status: 'INACTIVE' } });
    await expect(service.assignCaptains(manager, input)).rejects.toThrow(BadRequestException);
  });

  it('rejects an unknown captain with 404', async () => {
    const { service } = setupBulk({ candidate: null });
    await expect(service.assignCaptains(manager, input)).rejects.toThrow('Captain not found');
  });

  it('rejects tables outside the restaurant with 404', async () => {
    const { service } = setupBulk({ result: null });
    await expect(service.assignCaptains(manager, input)).rejects.toThrow(NotFoundException);
  });
});
