import { Body, Controller, Get, Header, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  authenticatorDisabledSchema,
  authenticatorDisableSchema,
  authenticatorEnabledSchema,
  authenticatorEnableSchema,
  authenticatorPasswordSchema,
  authenticatorSetupSchema,
  authenticatorStatusSchema,
} from '@rms/api-contract';
import type { z } from 'zod';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { AuthenticatorService } from './authenticator.service';

@ApiTags('authenticator')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('auth/authenticator')
export class AuthenticatorController {
  constructor(private readonly service: AuthenticatorService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ schema: zodOpenApiSchema(authenticatorStatusSchema) })
  status(@CurrentActor() actor: Actor) {
    return this.service.status(actor);
  }

  @Post('setup')
  @Header('Cache-Control', 'private, no-store')
  @ApiBody({ schema: zodOpenApiSchema(authenticatorPasswordSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(authenticatorSetupSchema) })
  setup(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(authenticatorPasswordSchema))
    body: z.infer<typeof authenticatorPasswordSchema>,
  ) {
    return this.service.setup(actor, body.password);
  }

  @Post('enable')
  @Header('Cache-Control', 'private, no-store')
  @ApiBody({ schema: zodOpenApiSchema(authenticatorEnableSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(authenticatorEnabledSchema) })
  enable(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(authenticatorEnableSchema))
    body: z.infer<typeof authenticatorEnableSchema>,
  ) {
    return this.service.enable(actor, body.code);
  }

  @Post('disable')
  @Header('Cache-Control', 'private, no-store')
  @ApiBody({ schema: zodOpenApiSchema(authenticatorDisableSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(authenticatorDisabledSchema) })
  disable(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(authenticatorDisableSchema))
    body: z.infer<typeof authenticatorDisableSchema>,
  ) {
    return this.service.disable(actor, body.password, body.code);
  }
}
