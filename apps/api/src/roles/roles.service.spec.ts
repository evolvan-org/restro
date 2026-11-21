import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import type { RoleRecord, RolesRepository } from './roles.repository';
import { RolesService } from './roles.service';

function role(overrides: Partial<RoleRecord> & { keys?: string[] } = {}): RoleRecord {
  const { keys = [], ...rest } = overrides;
  return {
    id: 'role-x',
    name: 'Custom',
    description: null,
    isSystem: false,
    isOwner: false,
    permissions: keys.map((permissionKey) => ({ permissionKey })),
    _count: { users: 0 },
    ...rest,
  };
}

const manager = {
  userId: 'u-manager',
  restaurantId: 'r1',
  roleId: 'role-manager',
  role: 'MANAGER',
  isOwner: false,
  permissions: [Permission.ROLE_WRITE, Permission.MENU_READ, Permission.MENU_WRITE],
} as unknown as Actor;

function setup(found: RoleRecord | null) {
  const repository = {
    find: jest.fn().mockResolvedValue(found),
    create: jest
      .fn()
      .mockImplementation((_r, data) => Promise.resolve(role({ keys: data.permissions }))),
    update: jest.fn().mockResolvedValue(found),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  return { repository, service: new RolesService(repository as unknown as RolesRepository) };
}

describe('RolesService', () => {
  it('refuses to edit or delete the Owner role', async () => {
    const { service } = setup(role({ isOwner: true, isSystem: true, name: 'OWNER' }));
    await expect(service.update(manager, 'role-x', { description: 'x' })).rejects.toThrow(
      'The Owner role cannot be edited',
    );
    await expect(service.remove(manager, 'role-x', {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses to edit the actor's own role", async () => {
    const { service } = setup(role({ id: 'role-manager' }));
    await expect(service.update(manager, 'role-manager', { description: 'x' })).rejects.toThrow(
      'You cannot edit your own role',
    );
  });

  it('refuses to grant a permission the actor does not hold', async () => {
    const { service, repository } = setup(null);
    await expect(
      service.create(manager, { name: 'Sneaky', permissions: [Permission.BILL_DISCOUNT] }),
    ).rejects.toThrow('bill:discount');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('allows granting held permissions and eligibility markers', async () => {
    const { service, repository } = setup(null);
    await service.create(manager, {
      name: 'Host',
      permissions: [Permission.MENU_READ, Permission.TABLE_BE_CAPTAIN],
    });
    expect(repository.create).toHaveBeenCalled();
  });

  it('refuses to revoke a permission the actor does not hold', async () => {
    const { service } = setup(role({ keys: [Permission.BILL_DISCOUNT] }));
    await expect(service.update(manager, 'role-x', { permissions: [] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('does not rename or delete default roles', async () => {
    const { service } = setup(role({ isSystem: true, name: 'CAPTAIN' }));
    await expect(service.update(manager, 'role-x', { name: 'Waiter' })).rejects.toThrow(
      'Default roles cannot be renamed',
    );
    await expect(service.remove(manager, 'role-x', {})).rejects.toThrow(
      'Default roles cannot be deleted',
    );
  });

  it('blocks deleting a role with users until they are reassigned, reporting the count', async () => {
    const { service, repository } = setup(role({ _count: { users: 3 } }));
    await expect(service.remove(manager, 'role-x', {})).rejects.toBeInstanceOf(ConflictException);
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('only lets an Owner reassign users to the Owner role', async () => {
    const { service, repository } = setup(role({ _count: { users: 1 } }));
    repository.find
      .mockResolvedValueOnce(role({ _count: { users: 1 } }))
      .mockResolvedValueOnce(role({ id: 'owner', isOwner: true }));
    await expect(service.remove(manager, 'role-x', { reassignToRoleId: 'owner' })).rejects.toThrow(
      'Only an Owner can assign the Owner role',
    );
  });

  it('refuses to delete a role holding permissions the actor does not hold', async () => {
    const { service, repository } = setup(role({ keys: [Permission.BILL_DISCOUNT] }));
    await expect(service.remove(manager, 'role-x', {})).rejects.toThrow('bill:discount');
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
