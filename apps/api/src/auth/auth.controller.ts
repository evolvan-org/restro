import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type LoginRequest,
  loginRequestSchema,
  type LoginResponse,
  loginResponseSchema,
  type RegisterRequest,
  registerRequestSchema,
  type RegisterResponse,
  registerResponseSchema,
} from '@rms/api-contract';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { AuthService } from './auth.service';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register user',
    description: 'Creates a new user account.',
  })
  @ApiBody({ schema: zodOpenApiSchema(registerRequestSchema) })
  @ApiOkResponse({
    description: 'Registration result',
    schema: zodOpenApiSchema(registerResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Missing or malformed registration details'))
  register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
  ): Promise<RegisterResponse> {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login user',
    description:
      'Authenticates a user using their email and password and returns a JWT access token valid for 24 hours. Send it as `Authorization: Bearer <token>`. Inactive accounts cannot log in. There is no logout endpoint: clients log out by discarding the token.',
  })
  @ApiBody({ schema: zodOpenApiSchema(loginRequestSchema) })
  @ApiOkResponse({ description: 'An access token', schema: zodOpenApiSchema(loginResponseSchema) })
  @ApiBadRequestResponse(apiError('Missing or malformed email or password'))
  @ApiUnauthorizedResponse(apiError('Wrong email or password, or the account is not active'))
  login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
  ): Promise<LoginResponse> {
    return this.authService.login(body);
  }
}
