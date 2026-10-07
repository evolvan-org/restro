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
  type CreateTableRequest,
  createTableRequestSchema,
  type CreateTableResponse,
  createTableResponseSchema,
  type TableListQuery,
  tableListQuerySchema,
  type TableListResponse,
  tableListResponseSchema,
  type TableOptionsResponse,
  tableOptionsResponseSchema,
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

import type { Actor } from '../../common/auth/authenticated-request';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermissions } from '../../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../../common/swagger/zod-openapi';
import { TablesService } from './tables.service';

@ApiTags('tables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing permission'))
@Controller('table/tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
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

  @Get('options')
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

  @Post()
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

  @Patch(':id')
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({
    summary: 'Update a restaurant table',
    description:
      'Updates table number, capacity, section or current status. Requires `restaurant:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(updateTableRequestSchema) })
  @ApiOkResponse({
    description: 'The updated table',
    schema: zodOpenApiSchema(updateTableResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid data, section or status'))
  @ApiNotFoundResponse(apiError('No table with this id in your restaurant'))
  @ApiConflictResponse(apiError('The table number is already in use'))
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTableRequestSchema)) input: UpdateTableRequest,
  ): Promise<UpdateTableResponse> {
    return this.tablesService.update(actor, id, input);
  }

  @Patch(':id/active')
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
}
