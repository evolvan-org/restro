import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
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
  type AttendanceAction,
  attendanceActionSchema,
  type AttendanceCorrection,
  type AttendanceCorrectionList,
  attendanceCorrectionListSchema,
  type AttendanceCorrectionQuery,
  attendanceCorrectionQuerySchema,
  attendanceCorrectionSchema,
  type AttendanceHistory,
  type AttendanceHistoryQuery,
  attendanceHistoryQuerySchema,
  attendanceHistorySchema,
  type AttendanceList,
  attendanceListSchema,
  type AttendanceQuery,
  attendanceQuerySchema,
  type AttendanceSession,
  attendanceSessionSchema,
  type CurrentAttendance,
  currentAttendanceSchema,
  type DecideAttendanceCorrection,
  decideAttendanceCorrectionSchema,
  type RequestAttendanceCorrection,
  requestAttendanceCorrectionSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor, AuthenticatedRequest } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { AttendanceService } from './attendance.service';

@ApiTags('attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication required'))
@ApiForbiddenResponse(apiError('Missing attendance permission'))
@ApiBadRequestResponse(apiError('Invalid attendance input'))
@ApiNotFoundResponse(apiError('Attendance record not found in the permitted scope'))
@ApiConflictResponse(
  apiError('Stale record, duplicate clock-in, invalid transition or conflicting correction'),
)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get('current')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ATTENDANCE_READ)
  @ApiOperation({ summary: 'Get your open attendance session using the server clock' })
  @ApiOkResponse({ schema: zodOpenApiSchema(currentAttendanceSchema) })
  current(@CurrentActor() actor: Actor): Promise<CurrentAttendance> {
    return this.service.current(actor);
  }
  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ATTENDANCE_READ)
  @ApiOperation({ summary: 'List own attendance; workforce managers may view all staff' })
  @ApiZodQuery(attendanceQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(attendanceListSchema) })
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(attendanceQuerySchema)) query: AttendanceQuery,
  ): Promise<AttendanceList> {
    return this.service.list(actor, query);
  }
  @Post('actions')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ATTENDANCE_READ, Permission.ATTENDANCE_CLOCK)
  @ApiOperation({
    summary: 'Clock yourself in/out or start/end a break; location/device labels are self-reported',
  })
  @ApiBody({ schema: zodOpenApiSchema(attendanceActionSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(attendanceSessionSchema) })
  act(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(attendanceActionSchema)) input: AttendanceAction,
    @Req() request: AuthenticatedRequest,
  ): Promise<AttendanceSession> {
    return this.service.act(actor, input, request.headers['user-agent'] ?? null);
  }
  @Get('corrections')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ATTENDANCE_READ)
  @ApiOperation({
    summary: 'List own correction requests; managers and authorised reviewers may view all',
  })
  @ApiZodQuery(attendanceCorrectionQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(attendanceCorrectionListSchema) })
  corrections(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(attendanceCorrectionQuerySchema)) query: AttendanceCorrectionQuery,
  ): Promise<AttendanceCorrectionList> {
    return this.service.corrections(actor, query);
  }
  @Post(':id/corrections')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ATTENDANCE_READ)
  @ApiOperation({
    summary: 'Request a closed-session correction; raw clock records remain unchanged',
  })
  @ApiBody({ schema: zodOpenApiSchema(requestAttendanceCorrectionSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(attendanceCorrectionSchema) })
  requestCorrection(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(requestAttendanceCorrectionSchema))
    input: RequestAttendanceCorrection,
  ): Promise<AttendanceCorrection> {
    return this.service.requestCorrection(actor, id, input);
  }
  @Post('corrections/:id/decision')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ATTENDANCE_READ, Permission.ATTENDANCE_APPROVE)
  @ApiOperation({ summary: 'Approve or reject a correction with an audited decision' })
  @ApiBody({ schema: zodOpenApiSchema(decideAttendanceCorrectionSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(attendanceCorrectionSchema) })
  decide(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideAttendanceCorrectionSchema))
    input: DecideAttendanceCorrection,
  ): Promise<AttendanceCorrection> {
    return this.service.decideCorrection(actor, id, input);
  }
  @Get(':id/history')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ATTENDANCE_READ)
  @ApiOperation({
    summary: 'Read attendance actions and correction decisions with device/location provenance',
  })
  @ApiZodQuery(attendanceHistoryQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(attendanceHistorySchema) })
  history(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(attendanceHistoryQuerySchema)) query: AttendanceHistoryQuery,
  ): Promise<AttendanceHistory> {
    return this.service.history(actor, id, query.page, query.pageSize);
  }
}
