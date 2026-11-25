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
