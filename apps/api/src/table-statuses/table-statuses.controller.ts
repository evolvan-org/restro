import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type CreateTableStatusRequest,
  createTableStatusRequestSchema,
  type ReorderTableStatusesRequest,
  reorderTableStatusesRequestSchema,
  reorderTableStatusesResponseSchema,
  type TableStatus,
  type TableStatusListQuery,
  tableStatusListQuerySchema,
  type TableStatusListResponse,
  tableStatusListResponseSchema,
  tableStatusSchema,
  type UpdateTableStatusActiveRequest,
  updateTableStatusActiveRequestSchema,
  type UpdateTableStatusRequest,
  updateTableStatusRequestSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { TableStatusesService } from './table-statuses.service';

@ApiTags('table statuses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing the required restaurant permission'))
@Controller('table-statuses')
export class TableStatusesController {
  constructor(private readonly tableStatusesService: TableStatusesService) {}

  @Get()
  @RequirePermissions(Permission.RESTAURANT_READ)
  @ApiOperation({
    summary: 'List table statuses',
    description:
      "Lists active and inactive statuses for the caller's restaurant in display order. Requires `restaurant:read`.",
  })
  @ApiZodQuery(tableStatusListQuerySchema)
  @ApiOkResponse({
    description: 'A page of table statuses',
    schema: zodOpenApiSchema(tableStatusListResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid query parameters'))
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(tableStatusListQuerySchema)) query: TableStatusListQuery,
  ): Promise<TableStatusListResponse> {
    return this.tableStatusesService.list(actor, query);
  }

  @Post()
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({
    summary: 'Create a custom table status',
    description:
      'Creates an active custom status. Omit display order to place it at the end. Requires `restaurant:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(createTableStatusRequestSchema) })
  @ApiCreatedResponse({
    description: 'The created custom table status',
    schema: zodOpenApiSchema(tableStatusSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid table status data'))
  @ApiConflictResponse(apiError('The status code is already in use'))
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createTableStatusRequestSchema)) input: CreateTableStatusRequest,
  ): Promise<TableStatus> {
    return this.tableStatusesService.create(actor, input);
  }

  @Patch('reorder')
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({
    summary: 'Reorder table statuses',
    description:
      'Persists the full status list in the requested display order. Requires `restaurant:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(reorderTableStatusesRequestSchema) })
  @ApiOkResponse({
    description: 'All table statuses in their updated order',
    schema: zodOpenApiSchema(reorderTableStatusesResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid, duplicate, incomplete, or stale status list'))
  reorder(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(reorderTableStatusesRequestSchema))
    input: ReorderTableStatusesRequest,
  ): Promise<TableStatus[]> {
    return this.tableStatusesService.reorder(actor, input);
  }

  @Patch(':id')
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({
    summary: 'Update a table status',
    description:
      'Updates name, code and display order. A system status code is immutable. Requires `restaurant:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(updateTableStatusRequestSchema) })
  @ApiOkResponse({
    description: 'The updated table status',
    schema: zodOpenApiSchema(tableStatusSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid data or an attempt to change a system status code'))
  @ApiNotFoundResponse(apiError('No table status with this id in your restaurant'))
  @ApiConflictResponse(apiError('The status code is already in use'))
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTableStatusRequestSchema)) input: UpdateTableStatusRequest,
  ): Promise<TableStatus> {
    return this.tableStatusesService.update(actor, id, input);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({
    summary: 'Activate or deactivate a table status',
    description: 'Changes whether the status is available for use. Requires `restaurant:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(updateTableStatusActiveRequestSchema) })
  @ApiOkResponse({
    description: 'The updated table status',
    schema: zodOpenApiSchema(tableStatusSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid id or active state'))
  @ApiNotFoundResponse(apiError('No table status with this id in your restaurant'))
  updateActive(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTableStatusActiveRequestSchema))
    input: UpdateTableStatusActiveRequest,
  ): Promise<TableStatus> {
    return this.tableStatusesService.updateActive(actor, id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({
    summary: 'Delete a custom table status',
    description:
      'Deletes an unused custom status. System and assigned statuses cannot be deleted. Requires `restaurant:write`.',
  })
  @ApiNoContentResponse({ description: 'The custom status was deleted' })
  @ApiNotFoundResponse(apiError('No table status with this id in your restaurant'))
  @ApiConflictResponse(apiError('The status is system-defined or assigned to a table'))
  delete(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.tableStatusesService.delete(actor, id);
  }
}
