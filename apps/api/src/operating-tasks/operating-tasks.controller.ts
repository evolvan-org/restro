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
  type CancelOperatingTask,
  cancelOperatingTaskSchema,
  type CreateOperatingTask,
  createOperatingTaskSchema,
  type OperatingTask,
  type OperatingTaskAssignees,
  operatingTaskAssigneesSchema,
  type OperatingTaskHistory,
  type OperatingTaskHistoryQuery,
  operatingTaskHistoryQuerySchema,
  operatingTaskHistorySchema,
  type OperatingTaskList,
  operatingTaskListSchema,
  type OperatingTaskQuery,
  operatingTaskQuerySchema,
  operatingTaskSchema,
  type RecordOperatingTask,
  recordOperatingTaskSchema,
  type ResolveOperatingTask,
  resolveOperatingTaskSchema,
  type UpdateOperatingTask,
  updateOperatingTaskSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { OperatingTasksService } from './operating-tasks.service';

@ApiTags('operating-tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication required'))
@ApiForbiddenResponse(apiError('Missing task permission'))
@ApiBadRequestResponse(apiError('Invalid task input'))
@ApiNotFoundResponse(apiError('Task or active assignee not found in the caller restaurant'))
@ApiConflictResponse(apiError('Stale version or invalid task transition'))
@Controller('operating-tasks')
export class OperatingTasksController {
  constructor(private readonly service: OperatingTasksService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.TASK_READ)
  @ApiOperation({ summary: 'List operating checks; non-managers see only their assigned tasks' })
  @ApiZodQuery(operatingTaskQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(operatingTaskListSchema) })
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(operatingTaskQuerySchema)) query: OperatingTaskQuery,
  ): Promise<OperatingTaskList> {
    return this.service.list(actor, query);
  }

  @Get('assignees')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.TASK_MANAGE)
  @ApiOperation({ summary: 'List active staff eligible to complete checks' })
  @ApiOkResponse({ schema: zodOpenApiSchema(operatingTaskAssigneesSchema) })
  assignees(@CurrentActor() actor: Actor): Promise<OperatingTaskAssignees> {
    return this.service.assignees(actor);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.TASK_MANAGE)
  @ApiOperation({ summary: 'Assign an operating check with a due time' })
  @ApiBody({ schema: zodOpenApiSchema(createOperatingTaskSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(operatingTaskSchema) })
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createOperatingTaskSchema)) input: CreateOperatingTask,
  ): Promise<OperatingTask> {
    return this.service.create(actor, input);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.TASK_MANAGE)
  @ApiOperation({ summary: 'Edit a pending check; preserve the previous assignment and deadline' })
  @ApiBody({ schema: zodOpenApiSchema(updateOperatingTaskSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(operatingTaskSchema) })
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateOperatingTaskSchema)) input: UpdateOperatingTask,
  ): Promise<OperatingTask> {
    return this.service.update(actor, id, input);
  }

  @Post(':id/record')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.TASK_READ, Permission.TASK_COMPLETE)
  @ApiOperation({
    summary: 'Record completion or an exception, with the observed measurement when required',
  })
  @ApiBody({ schema: zodOpenApiSchema(recordOperatingTaskSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(operatingTaskSchema) })
  record(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordOperatingTaskSchema)) input: RecordOperatingTask,
  ): Promise<OperatingTask> {
    return this.service.record(actor, id, input);
  }

  @Post(':id/cancel')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.TASK_MANAGE)
  @ApiOperation({
    summary: 'Cancel an unfinished check with a recorded reason; retain its history',
  })
  @ApiBody({ schema: zodOpenApiSchema(cancelOperatingTaskSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(operatingTaskSchema) })
  cancel(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelOperatingTaskSchema)) input: CancelOperatingTask,
  ): Promise<OperatingTask> {
    return this.service.cancel(actor, id, input);
  }

  @Post(':id/resolve')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.TASK_MANAGE)
  @ApiOperation({ summary: 'Resolve an exception with a corrective-action note' })
  @ApiBody({ schema: zodOpenApiSchema(resolveOperatingTaskSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(operatingTaskSchema) })
  resolve(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolveOperatingTaskSchema)) input: ResolveOperatingTask,
  ): Promise<OperatingTask> {
    return this.service.resolve(actor, id, input);
  }

  @Get(':id/history')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.TASK_READ)
  @ApiOperation({ summary: 'Read assignment, overdue, completion and exception history' })
  @ApiZodQuery(operatingTaskHistoryQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(operatingTaskHistorySchema) })
  history(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(operatingTaskHistoryQuerySchema)) query: OperatingTaskHistoryQuery,
  ): Promise<OperatingTaskHistory> {
    return this.service.history(actor, id, query.page, query.pageSize);
  }
}
