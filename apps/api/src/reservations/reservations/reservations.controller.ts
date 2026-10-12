import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type CreateReservationRequest,
  createReservationRequestSchema,
  type Reservation,
  RESERVATION_DURATION_MINUTES,
  type ReservationListQuery,
  reservationListQuerySchema,
  type ReservationListResponse,
  reservationListResponseSchema,
  reservationSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../../common/auth/authenticated-request';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermissions } from '../../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../../common/swagger/zod-openapi';
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

  @Post()
  @RequirePermissions(Permission.RESERVATION_WRITE)
  @ApiOperation({
    summary: 'Create a reservation',
    description:
      'Creates or reuses a guest by phone number and books a future BOOKED reservation. ' +
      `A table is held for ${RESERVATION_DURATION_MINUTES} minutes from the reservation time; ` +
      'a conflicting active reservation on the same table returns 409. Requires `reservation:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(createReservationRequestSchema) })
  @ApiCreatedResponse({
    description: 'The created reservation with embedded guest',
    schema: zodOpenApiSchema(reservationSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid reservation data'))
  @ApiConflictResponse(apiError('The table is already reserved for an overlapping time'))
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createReservationRequestSchema)) input: CreateReservationRequest,
  ): Promise<Reservation> {
    return this.service.create(actor, input);
  }
}
