import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type GuestLookupQuery,
  guestLookupQuerySchema,
  type GuestLookupResponse,
  guestLookupResponseSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import type { Response } from 'express';

import type { Actor } from '../../common/auth/authenticated-request';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermissions } from '../../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../../common/swagger/zod-openapi';
import { GuestsService } from './guests.service';

@ApiTags('guests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing the required reservation permission'))
@Controller('reservations/guests')
export class GuestsController {
  constructor(private readonly service: GuestsService) {}

  @Get('lookup')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.RESERVATION_WRITE)
  @ApiOperation({
    summary: 'Look up a guest by phone number',
    description:
      "Finds an existing guest in the caller's restaurant for walk-in intake. Requires `reservation:write`.",
  })
  @ApiZodQuery(guestLookupQuerySchema)
  @ApiOkResponse({
    description: 'The matching guest, or null when no guest exists for this phone number',
    schema: zodOpenApiSchema(guestLookupResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid lookup query parameters'))
  async lookup(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(guestLookupQuerySchema)) query: GuestLookupQuery,
    @Res() response: Response<GuestLookupResponse>,
  ): Promise<void> {
    const guest = await this.service.lookup(actor, query);
    // Nest sends an empty body for a null return; the shared nullable schema requires JSON null.
    response.json(guest);
  }
}
