import { ConflictException } from '@nestjs/common';
import { staffListResponseSchema, staffRolesResponseSchema } from '@rms/api-contract';

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

  it('stops a non-Owner from changing or deactivating an Account Owner', async () => {
    const service = setup(new Error('must not be reached'));
    const manager = {
      userId: 'u-mgr',
      restaurantId: 'r1',
      roleId: 'role-mgr',
      role: 'MANAGER',
      isOwner: false,
      permissions: ['user:write'],
    } as unknown as Actor;
    await expect(service.updateStatus(manager, 'u-other', { status: 'INACTIVE' })).rejects.toThrow(
      'Only an Account Owner can manage another Account Owner',
    );
    await expect(
      service.update(manager, 'u-other', { name: 'x', phone: '', roleId: 'role-mgr' }),
    ).rejects.toThrow('Only an Account Owner');
  });
});

describe('StaffService responses match the API contract', () => {
  const ownerRole = {
    id: '6f1c2b0e-8a3d-4c1e-9b2a-1d4e5f6a7b8c',
    name: 'Account Owner',
    isOwner: true,
    permissions: [],
  };
  const managerRole = {
    id: '0b9e7c6d-5a4f-4e3d-8c2b-1a0f9e8d7c6b',
    name: 'Manager',
    isOwner: false,
    permissions: [{ permissionKey: 'user:read' }],
  };

  function contractService() {
    const repository = {
      findPage: jest.fn().mockResolvedValue({
        total: 1,
        items: [
          {
            id: '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
            name: 'Arjun',
            email: 'arjun@example.com',
            phone: null,
            status: 'ACTIVE',
            createdAt: new Date('2026-11-01T10:00:00.000Z'),
            role: ownerRole,
          },
        ],
      }),
      findRoles: jest.fn().mockResolvedValue([ownerRole, managerRole]),
    };
    return new StaffService(
      repository as unknown as StaffRepository,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('returns a staff list the strict contract schema accepts (no internal role fields)', async () => {
    const result = await contractService().list(owner, { page: 1, pageSize: 20 });

    expect(() => staffListResponseSchema.parse(result)).not.toThrow();
    expect(result.data[0]?.role).toEqual({ id: ownerRole.id, name: ownerRole.name });
  });

  it('returns assignable roles the strict contract schema accepts', async () => {
    const result = await contractService().listAssignableRoles(owner);

    expect(() => staffRolesResponseSchema.parse(result)).not.toThrow();
    expect(result).toEqual([
      { id: ownerRole.id, name: ownerRole.name },
      { id: managerRole.id, name: managerRole.name },
    ]);
  });
});
