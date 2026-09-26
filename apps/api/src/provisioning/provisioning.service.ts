import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';
import { hash } from 'bcrypt';

import { BCRYPT_ROUNDS } from '../common/auth/password';
import { ProvisioningRepository } from './provisioning.repository';

export type ProvisionOwnerCommand = {
  name: string;
  restaurantName: string;
  email: string;
  password: string;
};

export type ProvisionedOwner = {
  restaurantId: string;
  userId: string;
  roleId: string;
};

@Injectable()
export class ProvisioningService {
  constructor(private readonly repository: ProvisioningRepository) {}

  /**
   * Turns a fresh signup into a fully usable tenant: a restaurant, the seeded
   * system roles, and the signing-up user assigned as ADMIN owner.
   *
   * Email uniqueness is enforced globally here so that signup is idempotent
   * (AC8) and login-by-email stays unambiguous.
   */
  async provisionOwner(command: ProvisionOwnerCommand): Promise<ProvisionedOwner> {
    if (await this.repository.emailExists(command.email)) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await hash(command.password, BCRYPT_ROUNDS);

    try {
      const { restaurantId, userId, roleId } = await this.repository.provisionOwner({
        restaurantName: command.restaurantName,
        owner: {
          name: command.name,
          email: command.email,
          passwordHash,
        },
      });

      return { restaurantId, userId, roleId };
    } catch (error) {
      // The global unique index on users.email is the source of truth: it closes
      // the race between two concurrent signups that both pass the check above.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email is already registered');
      }

      throw error;
    }
  }
}
