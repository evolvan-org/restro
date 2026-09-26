import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type ChangePasswordRequest,
  type ChangePasswordResponse,
  type ProfileResponse,
  profileResponseSchema,
  type UpdateProfileRequest,
} from '@rms/api-contract';
import { compare, hash } from 'bcrypt';

import { BCRYPT_ROUNDS } from '../common/auth/password';
import {
  ProfileEmailConflictError,
  type ProfileRecord,
  ProfileRepository,
} from './profile.repository';

@Injectable()
export class ProfileService {
  constructor(private readonly profileRepository: ProfileRepository) {}

  async getProfile(userId: string): Promise<ProfileResponse> {
    const profile = await this.profileRepository.findById(userId);
    return this.toProfileResponse(profile);
  }

  async updateProfile(userId: string, input: UpdateProfileRequest): Promise<ProfileResponse> {
    const existing = await this.profileRepository.findById(userId);
    this.assertActive(existing);

    const emailChanged = existing.email.trim().toLowerCase() !== input.email;
    if (emailChanged) {
      const emailOwnerId = await this.profileRepository.findEmailOwnerId(
        existing.restaurantId,
        input.email,
      );
      if (emailOwnerId && emailOwnerId !== userId) {
        throw new ConflictException('Email address is already in use');
      }
    }

    let updated: ProfileRecord;
    try {
      updated = await this.profileRepository.updateById(userId, {
        name: input.name,
        email: input.email,
        phone: input.phone?.trim() || null,
      });
    } catch (error) {
      if (error instanceof ProfileEmailConflictError) {
        throw new ConflictException('Email address is already in use');
      }
      throw error;
    }

    return this.toProfileResponse(updated);
  }

  async changePassword(
    userId: string,
    input: ChangePasswordRequest,
  ): Promise<ChangePasswordResponse> {
    const user = await this.profileRepository.findPasswordById(userId);

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }

    const currentPasswordMatches = await compare(input.currentPassword, user.passwordHash);
    if (!currentPasswordMatches) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await hash(input.newPassword, BCRYPT_ROUNDS);
    await this.profileRepository.updatePasswordById(userId, passwordHash);

    return { message: 'Password updated successfully' };
  }

  private toProfileResponse(profile: ProfileRecord | null): ProfileResponse {
    this.assertActive(profile);

    return profileResponseSchema.parse({
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      role: profile.role.name,
    });
  }

  private assertActive(profile: ProfileRecord | null): asserts profile is ProfileRecord {
    if (!profile || profile.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }
  }
}
