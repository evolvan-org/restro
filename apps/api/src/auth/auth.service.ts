import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type LoginRequest, type LoginResponse } from '@rms/api-contract';
import { type RegisterRequest, type RegisterResponse } from '@rms/api-contract';
import { compare } from 'bcrypt';
import jwt from 'jsonwebtoken';

import { PrismaService } from '../common/database/prisma.service';
import { ProvisioningService } from '../provisioning/provisioning.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly provisioning: ProvisioningService,
  ) {}

  async register(input: RegisterRequest): Promise<RegisterResponse> {
    const { userId, restaurantId, roleId } = await this.provisioning.provisionOwner({
      name: input.name,
      restaurantName: input.restaurantName,
      email: input.email,
      password: input.password,
    });

    // Sign the owner in immediately so the client can enter the app without a
    // separate login round-trip.
    const accessToken = this.signAccessToken({ userId, restaurantId, roleId });

    return {
      success: true,
      message: 'User registered successfully',
      accessToken,
    };
  }

  async login(input: LoginRequest): Promise<LoginResponse> {
    // Owner signup enforces email uniqueness globally (see ProvisioningService),
    // so a case-insensitive lookup resolves to at most one user.
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: input.email, mode: 'insensitive' },
      },
      select: {
        passwordHash: true,
        status: true,
        id: true,
        restaurantId: true,
        roleId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await compare(input.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }

    const accessToken = this.signAccessToken({
      userId: user.id,
      restaurantId: user.restaurantId,
      roleId: user.roleId,
    });

    return {
      success: true,
      message: 'Login successful',
      accessToken,
    };
  }

  private signAccessToken(payload: {
    userId: string;
    restaurantId: string;
    roleId: string;
  }): string {
    return jwt.sign(payload, this.config.getOrThrow<string>('JWT_SECRET'), {
      expiresIn: '1d',
      algorithm: 'HS256',
    });
  }
}
