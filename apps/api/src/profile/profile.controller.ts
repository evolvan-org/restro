import { Body, Controller, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  changePasswordRequestSchema,
  updateProfileRequestSchema,
  type ChangePasswordRequest,
  type ChangePasswordResponse,
  type ProfileResponse,
  type UpdateProfileRequest,
} from '@rms/api-contract';
import { CurrentUserId } from '../common/auth/current-user-id.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  ChangePasswordRequestDto,
  ChangePasswordResponseDto,
  ProfileResponseDto,
  UpdateProfileRequestDto,
} from './profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'View the authenticated user profile' })
  @ApiOkResponse({ description: 'The authenticated user profile', type: ProfileResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication failed or the account is inactive' })
  getProfile(@CurrentUserId() userId: string): Promise<ProfileResponse> {
    return this.profileService.getProfile(userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  @ApiBody({ type: UpdateProfileRequestDto })
  @ApiOkResponse({ description: 'The updated user profile', type: ProfileResponseDto })
  @ApiBadRequestResponse({ description: 'The profile data is invalid' })
  @ApiConflictResponse({ description: 'The email address is already in use' })
  @ApiUnauthorizedResponse({ description: 'Authentication failed or the account is inactive' })
  updateProfile(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(updateProfileRequestSchema)) input: UpdateProfileRequest,
  ): Promise<ProfileResponse> {
    return this.profileService.updateProfile(userId, input);
  }

  @Patch('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the authenticated user password' })
  @ApiBody({ type: ChangePasswordRequestDto })
  @ApiOkResponse({ description: 'The password was changed', type: ChangePasswordResponseDto })
  @ApiBadRequestResponse({ description: 'The password data or current password is invalid' })
  @ApiUnauthorizedResponse({ description: 'Authentication failed or the account is inactive' })
  changePassword(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) input: ChangePasswordRequest,
  ): Promise<ChangePasswordResponse> {
    return this.profileService.changePassword(userId, input);
  }
}
