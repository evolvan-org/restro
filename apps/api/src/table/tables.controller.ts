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
  type AssignTableCaptainRequest,
  assignTableCaptainRequestSchema,
  type AssignTableCaptainResponse,
  assignTableCaptainResponseSchema,
  type CaptainOptionsResponse,
  captainOptionsResponseSchema,
  type CreateTableRequest,
  createTableRequestSchema,
  type CreateTableResponse,
  createTableResponseSchema,
  type RestaurantTable,
  restaurantTableSchema,
  type TableLifecycleStatusListResponse,
  tableLifecycleStatusListResponseSchema,
  type TableListQuery,
  tableListQuerySchema,
  type TableListResponse,
  tableListResponseSchema,
  type TableOptionsResponse,
  tableOptionsResponseSchema,
  type TransitionTableStatusRequest,
  transitionTableStatusRequestSchema,
  type TransitionTableStatusResponse,
  transitionTableStatusResponseSchema,
  type UpdateTableActiveRequest,
  updateTableActiveRequestSchema,
  type UpdateTableActiveResponse,
  updateTableActiveResponseSchema,
  type UpdateTableRequest,
  updateTableRequestSchema,
  type UpdateTableResponse,
  updateTableResponseSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { TablesService } from './tables.service';

@ApiTags('tables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing permission'))
@Controller()
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get('tables')
  @RequirePermissions(Permission.RESTAURANT_READ)
  @ApiOperation({
    summary: 'List restaurant tables',
    description:
      'Tables in the restaurant, searchable by table number and filterable by section, status and active state. Requires `restaurant:read`.',
  })
  @ApiZodQuery(tableListQuerySchema)
  @ApiOkResponse({
    description: 'A page of restaurant tables',
    schema: zodOpenApiSchema(tableListResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid query parameters'))
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(tableListQuerySchema)) query: TableListQuery,
  ): Promise<TableListResponse> {
    return this.tablesService.list(actor, query);
  }

  @Get('tables/options')
  @RequirePermissions(Permission.RESTAURANT_READ)
  @ApiOperation({
    summary: 'List table form options',
    description:
      'Active dining sections and table statuses for the restaurant. Requires `restaurant:read`.',
  })
  @ApiOkResponse({
    description: 'Table form options',
    schema: zodOpenApiSchema(tableOptionsResponseSchema),
  })
  options(@CurrentActor() actor: Actor): Promise<TableOptionsResponse> {
    return this.tablesService.options(actor);
  }

  @Get('tables/captains')
  @RequirePermissions(Permission.TABLE_ASSIGN_CAPTAIN)
  @ApiOperation({
    summary: 'List eligible captains',
    description:
      "Active users in the caller's restaurant whose role holds `table:be-captain`. Requires `table:assign-captain`.",
  })
  @ApiOkResponse({
    description: 'Eligible captains',
    schema: zodOpenApiSchema(captainOptionsResponseSchema),
  })
  listCaptains(@CurrentActor() actor: Actor): Promise<CaptainOptionsResponse> {
    return this.tablesService.listCaptains(actor);
  }

  @Get('table-statuses')
  @RequirePermissions(Permission.RESTAURANT_READ)
  @ApiOperation({
    summary: 'List selectable table statuses',
    description:
      "Lists all active default and custom statuses for the caller's restaurant in display order. Requires `restaurant:read`.",
  })
  @ApiOkResponse({
    description: 'Active default and custom table statuses',
    schema: zodOpenApiSchema(tableLifecycleStatusListResponseSchema),
  })
  listLifecycleStatuses(@CurrentActor() actor: Actor): Promise<TableLifecycleStatusListResponse> {
    return this.tablesService.listLifecycleStatuses(actor);
  }

  @Get('table/:id')
  @RequirePermissions(Permission.RESTAURANT_READ)
  @ApiOperation({
    summary: 'Get a restaurant table',
    description: 'Returns a single table in the restaurant. Requires `restaurant:read`.',
  })
  @ApiOkResponse({
    description: 'The requested table',
    schema: zodOpenApiSchema(restaurantTableSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid table id'))
  @ApiNotFoundResponse(apiError('No table with this id in your restaurant'))
  get(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RestaurantTable> {
    return this.tablesService.get(actor, id);
  }

  @Post('tables')
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({
    summary: 'Create a restaurant table',
    description:
      'Creates a table in the restaurant with a unique table number, capacity, section and status. Requires `restaurant:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(createTableRequestSchema) })
  @ApiCreatedResponse({
    description: 'The created table',
    schema: zodOpenApiSchema(createTableResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid data, section or status'))
  @ApiConflictResponse(apiError('The table number is already in use'))
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createTableRequestSchema)) input: CreateTableRequest,
  ): Promise<CreateTableResponse> {
    return this.tablesService.create(actor, input);
  }

  @Patch('table/:id')
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({
    summary: 'Update a restaurant table',
    description: 'Updates table number, capacity or section. Requires `restaurant:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(updateTableRequestSchema) })
  @ApiOkResponse({
    description: 'The updated table',
    schema: zodOpenApiSchema(updateTableResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid data or section'))
  @ApiNotFoundResponse(apiError('No table with this id in your restaurant'))
  @ApiConflictResponse(apiError('The table number is already in use'))
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTableRequestSchema)) input: UpdateTableRequest,
  ): Promise<UpdateTableResponse> {
    return this.tablesService.update(actor, id, input);
  }

  @Patch('table/:id/active')
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({
    summary: 'Activate or deactivate a restaurant table',
    description:
      'Soft-deletes or restores a table: tables are never hard-deleted, so deactivating keeps it (and its reservation and order history) while hiding it from future use. Requires `restaurant:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(updateTableActiveRequestSchema) })
  @ApiOkResponse({
    description: 'The updated table',
    schema: zodOpenApiSchema(updateTableActiveResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid active state'))
  @ApiNotFoundResponse(apiError('No table with this id in your restaurant'))
  updateActiveState(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTableActiveRequestSchema)) input: UpdateTableActiveRequest,
  ): Promise<UpdateTableActiveResponse> {
    return this.tablesService.updateActiveState(actor, id, input);
  }

  @Patch('tables/:id/captain')
  @RequirePermissions(Permission.TABLE_ASSIGN_CAPTAIN)
  @ApiOperation({
    summary: 'Assign, change or clear a table captain',
    description:
      'Sets captainUserId on a table; null clears it. The captain must be an active user of the same restaurant whose role holds `table:be-captain`. Requires `table:assign-captain`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(assignTableCaptainRequestSchema) })
  @ApiOkResponse({
    description: 'The updated table with its embedded captain (null when unassigned)',
    schema: zodOpenApiSchema(assignTableCaptainResponseSchema),
  })
  @ApiBadRequestResponse(
    apiError('Invalid id or body, inactive, other-restaurant or ineligible user'),
  )
  @ApiNotFoundResponse(apiError('The table or captain does not exist'))
  assignCaptain(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignTableCaptainRequestSchema))
    input: AssignTableCaptainRequest,
  ): Promise<AssignTableCaptainResponse> {
    return this.tablesService.assignCaptain(actor, id, input);
  }

  @Patch('tables/:id/status')
  @RequirePermissions(Permission.TABLE_UPDATE_STATUS)
  @ApiOperation({
    summary: 'Change a table status',
    description:
      'Assigns any active default or custom status in the restaurant. Requires `table:update-status`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(transitionTableStatusRequestSchema) })
  @ApiOkResponse({
    description: 'The table with its updated status',
    schema: zodOpenApiSchema(transitionTableStatusResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid table id or status code'))
  @ApiNotFoundResponse(apiError('The table or target status does not exist'))
  @ApiConflictResponse(apiError('The table status changed concurrently; refresh and retry'))
  transitionStatus(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transitionTableStatusRequestSchema))
    input: TransitionTableStatusRequest,
  ): Promise<TransitionTableStatusResponse> {
    return this.tablesService.transitionStatus(actor, id, input);
  }
}
