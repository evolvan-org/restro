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
  loginRequestSchema,
  loginResponseSchema,
  type LoginRequest,
  type LoginResponse,
} from '@rms/api-contract';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { AuthService } from './auth.service';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
