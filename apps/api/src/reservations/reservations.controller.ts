import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type AssignReservationTableRequest,
  assignReservationTableRequestSchema,
  type AssignReservationTableResponse,
  assignReservationTableResponseSchema,
  type CancelReservationRequest,
  cancelReservationRequestSchema,
  type CreateReservationRequest,
  createReservationRequestSchema,
  type Reservation,
  type ReservationListQuery,
  reservationListQuerySchema,
  type ReservationListResponse,
  reservationListResponseSchema,
  reservationSchema,
  type UpdateReservationRequest,
  updateReservationRequestSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { RESERVATION_DURATION_MINUTES } from '@rms/shared';

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

  @Patch(':id/table')
  @RequirePermissions(Permission.RESERVATION_ASSIGN_TABLE)
  @ApiOperation({
    summary: 'Assign, reassign or unassign a reservation table',
    description:
      'Sets tableId on a BOOKED or SEATED reservation; null clears it. ' +
      'Checks tenant ownership, active state, capacity and overlapping BOOKED/SEATED reservations. ' +
      `The service window is ${RESERVATION_DURATION_MINUTES} minutes; touching boundaries are allowed. ` +
      'Does not change reservation status or table status. Requires `reservation:assign-table`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(assignReservationTableRequestSchema) })
  @ApiOkResponse({
    description: 'The updated reservation with its guest and assigned table (null when unassigned)',
    schema: zodOpenApiSchema(assignReservationTableResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid id or body, inactive table or insufficient capacity'))
  @ApiNotFoundResponse(apiError('The reservation or table does not exist in your restaurant'))
  @ApiConflictResponse(apiError('The reservation is not active or the table has an overlap'))
  assignTable(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignReservationTableRequestSchema))
    input: AssignReservationTableRequest,
  ): Promise<AssignReservationTableResponse> {
    return this.service.assignTable(actor, id, input);
  }

  @Patch(':id')
  @RequirePermissions(Permission.RESERVATION_WRITE)
  @ApiOperation({
    summary: 'Modify a booked reservation',
    description:
      'Partially updates the time, party size, notes or shared guest profile. ' +
      'Time and party-size edits revalidate table capacity and booking overlaps, excluding this reservation. ' +
      'Only BOOKED reservations may be edited. Requires `reservation:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(updateReservationRequestSchema) })
  @ApiOkResponse({
    description: 'The updated reservation with embedded guest',
    schema: zodOpenApiSchema(reservationSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid reservation id, fields, table state or party size'))
  @ApiNotFoundResponse(apiError('No reservation with this id in your restaurant'))
  @ApiConflictResponse(
    apiError('Reservation is not booked, table overlaps, or guest phone is in use'),
  )
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateReservationRequestSchema)) input: UpdateReservationRequest,
  ): Promise<Reservation> {
    return this.service.update(actor, id, input);
  }

  @Patch(':id/cancel')
  @RequirePermissions(Permission.RESERVATION_WRITE)
  @ApiOperation({
    summary: 'Cancel a reservation',
    description:
      "Cancels a reservation in the caller's restaurant, clears its held table and records an " +
      'optional reason. CANCELLED and COMPLETED reservations return 409. Requires `reservation:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(cancelReservationRequestSchema) })
  @ApiOkResponse({
    description: 'The cancelled reservation with tableId = null and its embedded guest',
    schema: zodOpenApiSchema(reservationSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid reservation id or cancellation reason'))
  @ApiNotFoundResponse(apiError('No reservation with this id in your restaurant'))
  @ApiConflictResponse(apiError('Cancelled or completed reservations cannot be cancelled'))
  cancel(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelReservationRequestSchema)) input: CancelReservationRequest,
  ): Promise<Reservation> {
    return this.service.cancel(actor, id, input);
  }

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
