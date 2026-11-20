import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type AcceptInviteRequest,
  acceptInviteRequestSchema,
  acceptInviteResponseSchema,
  type ForgotPasswordRequest,
  forgotPasswordRequestSchema,
  forgotPasswordResponseSchema,
  type LoginRequest,
  loginRequestSchema,
  type LoginResponse,
  loginResponseSchema,
  onboardingIncompleteErrorSchema,
  type RegisterRequest,
  registerRequestSchema,
  type RegisterResponse,
  registerResponseSchema,
  resendVerificationResponseSchema,
  type ResetPasswordRequest,
  resetPasswordRequestSchema,
  resetPasswordResponseSchema,
  type VerifyEmailRequest,
  verifyEmailRequestSchema,
  verifyEmailResponseSchema,
} from '@rms/api-contract';
import type { Request } from 'express';

import { AllowDuringSetup } from '../common/auth/allow-during-setup.decorator';
import { CurrentUserId } from '../common/auth/current-user-id.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { AuthService } from './auth.service';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a restaurant owner and send email verification' })
  @ApiBody({ schema: zodOpenApiSchema(registerRequestSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(registerResponseSchema) })
  @ApiBadRequestResponse(apiError('Missing or malformed registration details'))
  @ApiConflictResponse(apiError('Email is already registered'))
  @ApiServiceUnavailableResponse(
    apiError('Account created but verification delivery is unavailable'),
  )
  register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
  ): Promise<RegisterResponse> {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login an active user' })
  @ApiBody({ schema: zodOpenApiSchema(loginRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(loginResponseSchema) })
  @ApiBadRequestResponse(apiError('Missing or malformed email or password'))
  @ApiUnauthorizedResponse(apiError('Wrong credentials or account is not active'))
  @ApiForbiddenResponse({
    description: "The restaurant's setup is unfinished and only its owner can log in yet",
    schema: zodOpenApiSchema(onboardingIncompleteErrorSchema),
  })
  login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
  ): Promise<LoginResponse> {
    return this.authService.login(body);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify an email address using a single-use link token' })
  @ApiBody({ schema: zodOpenApiSchema(verifyEmailRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(verifyEmailResponseSchema) })
  @ApiBadRequestResponse(apiError('The verification link is invalid, expired, or used'))
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailRequestSchema)) body: VerifyEmailRequest) {
    return this.authService.verifyEmail(body);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @AllowDuringSetup()
  @ApiOperation({ summary: 'Resend verification email to the authenticated user' })
  @ApiOkResponse({ schema: zodOpenApiSchema(resendVerificationResponseSchema) })
  @ApiUnauthorizedResponse(apiError('Authentication failed or account is not active'))
  @ApiResponse({ status: 429, ...apiError('Verification email requested too frequently') })
  resendVerification(@CurrentUserId() userId: string) {
    return this.authService.resendVerification(userId);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password recovery without revealing account existence' })
  @ApiBody({ schema: zodOpenApiSchema(forgotPasswordRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(forgotPasswordResponseSchema) })
  @ApiResponse({ status: 429, ...apiError('Password recovery requested too frequently') })
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) body: ForgotPasswordRequest,
    @Req() request: Request,
  ) {
    return this.authService.forgotPassword(
      body,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
    );
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset a password using a single-use recovery token' })
  @ApiBody({ schema: zodOpenApiSchema(resetPasswordRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(resetPasswordResponseSchema) })
  @ApiBadRequestResponse(apiError('The reset link or new password is invalid'))
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
  ) {
    return this.authService.resetPassword(body);
  }

  @Post('accept-invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a staff invitation and choose a password' })
  @ApiBody({ schema: zodOpenApiSchema(acceptInviteRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(acceptInviteResponseSchema) })
  @ApiBadRequestResponse(apiError('The invitation link or password is invalid'))
  acceptInvite(@Body(new ZodValidationPipe(acceptInviteRequestSchema)) body: AcceptInviteRequest) {
    return this.authService.acceptInvite(body);
  }
}
