import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type LoginRequest, type LoginResponse } from '@rms/api-contract';
import { compare, hash } from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaService } from '../common/database/prisma.service';
import { type RegisterRequest, type RegisterResponse } from '@rms/api-contract';

const TEMP_RESTAURANT_NAME = 'Temporary Restaurant';
const TEMP_ADMIN_ROLE_NAME = 'ADMIN';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterRequest): Promise<RegisterResponse> {
    // TODO(restaurant registration): replace this temporary default tenant/role
    // once registration creates the real restaurant and seeds its roles.
    const { restaurantId, roleId } =
      await this.getTemporaryRestaurantAndRoleIds();

    const existingUser = await this.prisma.user.findUnique({
      where: {
        restaurantId_email: {
          restaurantId,
          email: input.email,
        },
      },
    });

    if (existingUser) {
      throw new UnauthorizedException('Email is already registered');
    }

    const passwordHash = await hash(input.password, 10);

    await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        restaurantId,
        roleId,
      },
    });

    return {
      success: true,
      message: 'User registered successfully',
    };
  }

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

    const accessToken = jwt.sign(
      { userId: user.id, restaurantId: user.restaurantId, roleId: user.roleId  },
      this.config.getOrThrow<string>('JWT_SECRET'),
      { expiresIn: '1d' },
    );

    return {
      success: true,
      message: 'Login successful',
      accessToken,
    };
  }

  // TODO(restaurant registration): temporary bridge until restaurant signup and
  // role seeding are implemented; remove when real tenant creation lands.
  private async getTemporaryRestaurantAndRoleIds(): Promise<{
    restaurantId: string;
    roleId: string;
  }> {
    const restaurant =
      (await this.prisma.restaurant.findFirst({
        where: { name: TEMP_RESTAURANT_NAME },
        select: { id: true },
      })) ??
      (await this.prisma.restaurant.create({
        data: { name: TEMP_RESTAURANT_NAME },
        select: { id: true },
      }));

    const role =
      (await this.prisma.role.findUnique({
        where: {
          restaurantId_name: {
            restaurantId: restaurant.id,
            name: TEMP_ADMIN_ROLE_NAME,
          },
        },
        select: { id: true },
      })) ??
      (await this.prisma.role.create({
        data: {
          restaurantId: restaurant.id,
          name: TEMP_ADMIN_ROLE_NAME,
          description: 'Temporary default role for auth registration',
          isSystem: true,
        },
        select: { id: true },
      }));

    return {
      restaurantId: restaurant.id,
      roleId: role.id,
    };
  }
}
