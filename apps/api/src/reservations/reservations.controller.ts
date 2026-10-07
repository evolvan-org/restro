import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type CreateWalkInRequest,
  createWalkInRequestSchema,
  type GuestLookupQuery,
  guestLookupQuerySchema,
  type GuestLookupResponse,
  guestLookupResponseSchema,
  type Reservation,
  type ReservationListQuery,
  reservationListQuerySchema,
  type ReservationListResponse,
  reservationListResponseSchema,
  reservationSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { ReservationsService } from './reservations.service';

@ApiTags('reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing the required reservation permission'))
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly service: ReservationsService) {}

  @Get()
  @RequirePermissions(Permission.RESERVATION_READ)
  @ApiOperation({
    summary: 'List reservations',
    description: "Lists reservations for the caller's restaurant. Requires `reservation:read`.",
  })
  @ApiZodQuery(reservationListQuerySchema)
  @ApiOkResponse({
    description: 'A page of reservations with embedded guests',
    schema: zodOpenApiSchema(reservationListResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid query parameters'))
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(reservationListQuerySchema)) query: ReservationListQuery,
  ): Promise<ReservationListResponse> {
    return this.service.list(actor, query);
  }
}

@ApiTags('guests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing the required reservation permission'))
@Controller('guests')
export class GuestsController {
  constructor(private readonly service: ReservationsService) {}

  @Get('lookup')
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
  lookup(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(guestLookupQuerySchema)) query: GuestLookupQuery,
  ): Promise<GuestLookupResponse> {
    return this.service.lookupGuest(actor, query);
  }
}

@ApiTags('walk-ins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing the required reservation permission'))
@Controller('walk-ins')
export class WalkInsController {
  constructor(private readonly service: ReservationsService) {}

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
    return this.service.createWalkIn(actor, input);
  }
}
