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
  changePasswordResponseSchema,
  profileResponseSchema,
  updateProfileRequestSchema,
  type ChangePasswordRequest,
  type ChangePasswordResponse,
  type ProfileResponse,
  type UpdateProfileRequest,
} from '@rms/api-contract';
import { CurrentUserId } from '../common/auth/current-user-id.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'View the authenticated user profile' })
  @ApiOkResponse({
    description: 'The authenticated user profile',
    schema: zodOpenApiSchema(profileResponseSchema),
  })
  @ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
  getProfile(@CurrentUserId() userId: string): Promise<ProfileResponse> {
    return this.profileService.getProfile(userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  @ApiBody({ schema: zodOpenApiSchema(updateProfileRequestSchema) })
  @ApiOkResponse({
    description: 'The updated user profile',
    schema: zodOpenApiSchema(profileResponseSchema),
  })
  @ApiBadRequestResponse(apiError('The profile data is invalid'))
  @ApiConflictResponse(apiError('The email address is already in use'))
  @ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
  updateProfile(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(updateProfileRequestSchema)) input: UpdateProfileRequest,
  ): Promise<ProfileResponse> {
    return this.profileService.updateProfile(userId, input);
  }

  @Patch('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the authenticated user password' })
  @ApiBody({ schema: zodOpenApiSchema(changePasswordRequestSchema) })
  @ApiOkResponse({
    description: 'The password was changed',
    schema: zodOpenApiSchema(changePasswordResponseSchema),
  })
  @ApiBadRequestResponse(apiError('The password data or current password is invalid'))
  @ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
  changePassword(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) input: ChangePasswordRequest,
  ): Promise<ChangePasswordResponse> {
    return this.profileService.changePassword(userId, input);
  }
}
