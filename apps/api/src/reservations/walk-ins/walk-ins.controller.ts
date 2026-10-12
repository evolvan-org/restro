import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type CreateWalkInRequest,
  createWalkInRequestSchema,
  type Reservation,
  reservationSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../../common/auth/authenticated-request';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermissions } from '../../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { apiError, zodOpenApiSchema } from '../../common/swagger/zod-openapi';
import { WalkInsService } from './walk-ins.service';

@ApiTags('walk-ins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing the required reservation permission'))
@Controller('reservations/walk-ins')
export class WalkInsController {
  constructor(private readonly service: WalkInsService) {}

  @Post()
  @RequirePermissions(Permission.RESERVATION_WRITE)
  @ApiOperation({
    summary: 'Create a walk-in reservation',
    description:
      'Creates or reuses a guest and immediately creates a SEATED reservation. Requires `reservation:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(createWalkInRequestSchema) })
  @ApiCreatedResponse({
    description: 'The created seated reservation with embedded guest',
    schema: zodOpenApiSchema(reservationSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid walk-in data'))
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createWalkInRequestSchema)) input: CreateWalkInRequest,
  ): Promise<Reservation> {
    return this.service.create(actor, input);
  }
}
