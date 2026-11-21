import { ConflictException } from '@nestjs/common';

import type { Actor } from '../../common/auth/authenticated-request';
import { LastOwnerError, type StaffRepository } from './staff.repository';
import { StaffService } from './staff.service';

const owner = {
  userId: 'u-owner',
  restaurantId: 'r1',
  roleId: 'role-owner',
  role: 'OWNER',
  isOwner: true,
  permissions: [],
} as unknown as Actor;

const staffRecord = (id: string, roleId: string) => ({
  id,
  name: 'Arjun',
  email: 'a@x.in',
  phone: null,
  status: 'ACTIVE',
  createdAt: new Date(),
  role: { id: roleId, name: 'OWNER', isOwner: true, permissions: [] },
});

function setup(error: Error) {
  const repository = {
    findById: jest.fn().mockResolvedValue(staffRecord('u-other', 'role-owner')),
    findRole: jest
      .fn()
      .mockResolvedValue({ id: 'role-mgr', name: 'MANAGER', isOwner: false, permissions: [] }),
    update: jest.fn().mockRejectedValue(error),
    updateStatus: jest.fn().mockRejectedValue(error),
  };
  const service = new StaffService(
    repository as unknown as StaffRepository,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return service;
}

describe('StaffService last-owner protection', () => {
  it('explains why the last active Owner cannot be demoted', async () => {
    const service = setup(new LastOwnerError('Arjun', 'role'));
    await expect(
      service.update(owner, 'u-other', { name: 'Arjun', phone: '', roleId: 'role-mgr' }),
    ).rejects.toThrow(/only active Account Owner.*changing their role/);
  });

  it('explains why the last active Owner cannot be deactivated', async () => {
    const service = setup(new LastOwnerError('Arjun', 'status'));
    await expect(service.updateStatus(owner, 'u-other', { status: 'INACTIVE' })).rejects.toThrow(
      ConflictException,
    );
  });
});
