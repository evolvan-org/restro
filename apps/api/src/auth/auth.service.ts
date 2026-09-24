import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type LoginRequest, type LoginResponse } from '@rms/api-contract';
import { compare } from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaService } from '../common/database/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async login(input: LoginRequest): Promise<LoginResponse> {
    // TODO(restaurant epic): scope login by restaurantId — email is unique per-tenant
    // (@@unique([restaurantId, email])), so findFirst must handle 0/1/many matches
    // and the JWT should carry restaurantId + roleId once tenants exist.
    const user = await this.prisma.user.findFirst({
      where: {
        email: input.email,
      },
      select: {
        passwordHash: true,
        status: true,
        id: true,
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

    const accessToken = jwt.sign(
      { userId: user.id },
      this.config.getOrThrow<string>('JWT_SECRET'),
      { expiresIn: '1d' },
    );

    return {
      success: true,
      message: 'Login successful',
      accessToken,
    };
  }
}
