import {
  Body,
  Controller,
  Get,
  Header,
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
  type AvailabilityQuery,
  availabilityQuerySchema,
  type CancelWorkforceRecord,
  cancelWorkforceRecordSchema,
  type CreateStaffAvailability,
  createStaffAvailabilitySchema,
  type CreateStaffShift,
  createStaffShiftSchema,
  type DecideStaffLeave,
  decideStaffLeaveSchema,
  type ReplaceStaffShift,
  replaceStaffShiftSchema,
  type RequestStaffLeave,
  requestStaffLeaveSchema,
  type ShiftQuery,
  shiftQuerySchema,
  type StaffAvailability,
  type StaffAvailabilityList,
  staffAvailabilityListSchema,
  staffAvailabilitySchema,
  type StaffLeave,
  type StaffLeaveList,
  staffLeaveListSchema,
  type StaffLeaveQuery,
  staffLeaveQuerySchema,
  staffLeaveSchema,
  type StaffShift,
  type StaffShiftList,
  staffShiftListSchema,
  staffShiftSchema,
  type UpdateStaffAvailability,
  updateStaffAvailabilitySchema,
  type UpdateStaffShift,
  updateStaffShiftSchema,
  workforceEntitySchema,
  type WorkforceHistory,
  type WorkforceHistoryQuery,
  workforceHistoryQuerySchema,
  workforceHistorySchema,
  type WorkforceSnapshot,
  type WorkforceStaff,
  workforceStaffSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { WorkforceService } from './workforce.service';

@ApiTags('workforce')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication required'))
@ApiForbiddenResponse(apiError('Missing scheduling or review permission'))
@ApiBadRequestResponse(apiError('Invalid workforce input or time interval'))
@ApiNotFoundResponse(
  apiError('Workforce record or eligible staff member not found in the permitted scope'),
)
@ApiConflictResponse(apiError('Stale version, shift clash or invalid state transition'))
@Controller('workforce')
export class WorkforceController {
  constructor(private readonly service: WorkforceService) {}
  @Get('staff')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ, Permission.WORKFORCE_MANAGE)
  @ApiOperation({ summary: 'List active staff eligible for schedules' })
  @ApiOkResponse({ schema: zodOpenApiSchema(workforceStaffSchema) })
  staff(@CurrentActor() actor: Actor): Promise<WorkforceStaff> {
    return this.service.staff(actor);
  }

  @Get('shifts')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ)
  @ApiOperation({ summary: 'List staff shifts and unresolved availability or leave clashes' })
  @ApiZodQuery(shiftQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(staffShiftListSchema) })
  shifts(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(shiftQuerySchema)) query: ShiftQuery,
  ): Promise<StaffShiftList> {
    return this.service.shifts(actor, query);
  }

  @Post('shifts')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ, Permission.WORKFORCE_MANAGE)
  @ApiOperation({ summary: 'Assign a shift after checking overlaps and approved absence' })
  @ApiBody({ schema: zodOpenApiSchema(createStaffShiftSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(staffShiftSchema) })
  createShift(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createStaffShiftSchema)) input: CreateStaffShift,
  ): Promise<StaffShift> {
    return this.service.createShift(actor, input);
  }

  @Patch('shifts/:id')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ, Permission.WORKFORCE_MANAGE)
  @ApiOperation({ summary: 'Edit a shift with a version check and preserved history' })
  @ApiBody({ schema: zodOpenApiSchema(updateStaffShiftSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(staffShiftSchema) })
  updateShift(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStaffShiftSchema)) input: UpdateStaffShift,
  ): Promise<StaffShift> {
    return this.service.updateShift(actor, id, input);
  }

  @Post('shifts/:id/replacement')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ, Permission.WORKFORCE_MANAGE)
  @ApiOperation({ summary: 'Assign replacement cover and retain the previous assignment' })
  @ApiBody({ schema: zodOpenApiSchema(replaceStaffShiftSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(staffShiftSchema) })
  replaceShift(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(replaceStaffShiftSchema)) input: ReplaceStaffShift,
  ): Promise<StaffShift> {
    return this.service.replaceShift(actor, id, input);
  }

  @Post('shifts/:id/cancel')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ, Permission.WORKFORCE_MANAGE)
  @ApiOperation({ summary: 'Cancel a shift with an audit reason' })
  @ApiBody({ schema: zodOpenApiSchema(cancelWorkforceRecordSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(staffShiftSchema) })
  cancelShift(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelWorkforceRecordSchema)) input: CancelWorkforceRecord,
  ): Promise<StaffShift> {
    return this.service.cancelShift(actor, id, input);
  }

  @Get('availability')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ)
  @ApiOperation({ summary: 'List own availability windows; managers may view all staff' })
  @ApiZodQuery(availabilityQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(staffAvailabilityListSchema) })
  availability(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(availabilityQuerySchema)) query: AvailabilityQuery,
  ): Promise<StaffAvailabilityList> {
    return this.service.availability(actor, query);
  }

  @Post('availability')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ)
  @ApiOperation({
    summary: 'Record own availability or unavailability; managers may record staff windows',
  })
  @ApiBody({ schema: zodOpenApiSchema(createStaffAvailabilitySchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(staffAvailabilitySchema) })
  createAvailability(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createStaffAvailabilitySchema)) input: CreateStaffAvailability,
  ): Promise<StaffAvailability> {
    return this.service.createAvailability(actor, input);
  }

  @Patch('availability/:id')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ)
  @ApiOperation({ summary: 'Edit an availability window and retain the prior values' })
  @ApiBody({ schema: zodOpenApiSchema(updateStaffAvailabilitySchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(staffAvailabilitySchema) })
  updateAvailability(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStaffAvailabilitySchema)) input: UpdateStaffAvailability,
  ): Promise<StaffAvailability> {
    return this.service.updateAvailability(actor, id, input);
  }

  @Post('availability/:id/archive')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ)
  @ApiOperation({ summary: 'Archive an availability window with its history' })
  @ApiBody({ schema: zodOpenApiSchema(cancelWorkforceRecordSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(staffAvailabilitySchema) })
  archiveAvailability(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelWorkforceRecordSchema)) input: CancelWorkforceRecord,
  ): Promise<StaffAvailability> {
    return this.service.archiveAvailability(actor, id, input);
  }

  @Get('leave')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ)
  @ApiOperation({ summary: 'List own leave requests; managers and leave reviewers may view all' })
  @ApiZodQuery(staffLeaveQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(staffLeaveListSchema) })
  leave(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(staffLeaveQuerySchema)) query: StaffLeaveQuery,
  ): Promise<StaffLeaveList> {
    return this.service.leave(actor, query);
  }

  @Post('leave')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ)
  @ApiOperation({ summary: 'Request leave for an exact time interval' })
  @ApiBody({ schema: zodOpenApiSchema(requestStaffLeaveSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(staffLeaveSchema) })
  requestLeave(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(requestStaffLeaveSchema)) input: RequestStaffLeave,
  ): Promise<StaffLeave> {
    return this.service.requestLeave(actor, input);
  }

  @Post('leave/:id/decision')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ, Permission.LEAVE_APPROVE)
  @ApiOperation({ summary: 'Approve or reject leave; existing shifts remain and show a clash' })
  @ApiBody({ schema: zodOpenApiSchema(decideStaffLeaveSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(staffLeaveSchema) })
  decideLeave(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideStaffLeaveSchema)) input: DecideStaffLeave,
  ): Promise<StaffLeave> {
    return this.service.decideLeave(actor, id, input);
  }

  @Post('leave/:id/cancel')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ)
  @ApiOperation({
    summary: 'Cancel pending leave or withdraw approved leave with reviewer authority',
  })
  @ApiBody({ schema: zodOpenApiSchema(cancelWorkforceRecordSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(staffLeaveSchema) })
  cancelLeave(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelWorkforceRecordSchema)) input: CancelWorkforceRecord,
  ): Promise<StaffLeave> {
    return this.service.cancelLeave(actor, id, input);
  }

  @Get(':entity/:id/history')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SCHEDULE_READ)
  @ApiOperation({ summary: 'Read immutable scheduling, availability or leave history' })
  @ApiZodQuery(workforceHistoryQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(workforceHistorySchema) })
  history(
    @CurrentActor() actor: Actor,
    @Param('entity', new ZodValidationPipe(workforceEntitySchema))
    entity: WorkforceSnapshot['entity'],
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(workforceHistoryQuerySchema)) query: WorkforceHistoryQuery,
  ): Promise<WorkforceHistory> {
    return this.service.history(actor, entity, id, query.page, query.pageSize);
  }
}
