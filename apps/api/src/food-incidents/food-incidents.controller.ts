import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
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
  type AddFoodIncidentEntry,
  addFoodIncidentEntrySchema,
  type CreateFoodIncident,
  createFoodIncidentSchema,
  type FoodIncident,
  type FoodIncidentBatchOptions,
  foodIncidentBatchOptionsSchema,
  type FoodIncidentBatchQuery,
  foodIncidentBatchQuerySchema,
  type FoodIncidentHistory,
  type FoodIncidentHistoryQuery,
  foodIncidentHistoryQuerySchema,
  foodIncidentHistorySchema,
  type FoodIncidentList,
  type FoodIncidentQuery,
  foodIncidentQuerySchema,
  foodIncidentSchema,
  foodIncidentsSchema,
  type ResolveFoodIncident,
  resolveFoodIncidentSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { FoodIncidentsService } from './food-incidents.service';

@ApiTags('food-incidents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.FOOD_INCIDENT_READ)
@ApiUnauthorizedResponse(apiError('Authentication required'))
@ApiForbiddenResponse(apiError('Missing food incident permission'))
@ApiBadRequestResponse(apiError('Invalid incident input, identifier or pagination'))
@ApiNotFoundResponse(apiError('Incident or batch not found in this restaurant'))
@ApiConflictResponse(apiError('Incident resolved or changed; refresh before continuing'))
@Controller('food-incidents')
export class FoodIncidentsController {
  constructor(private readonly incidents: FoodIncidentsService) {}

  @Get('batch-options')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(Permission.FOOD_INCIDENT_READ, Permission.FOOD_INCIDENT_MANAGE)
  @ApiOperation({
    summary: 'Select batch identities for an incident without exposing inventory costs',
  })
  @ApiZodQuery(foodIncidentBatchQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(foodIncidentBatchOptionsSchema) })
  batchOptions(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(foodIncidentBatchQuerySchema)) query: FoodIncidentBatchQuery,
  ): Promise<FoodIncidentBatchOptions> {
    return this.incidents.batchOptions(actor, query);
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(Permission.FOOD_INCIDENT_READ, Permission.FOOD_INCIDENT_MANAGE)
  @ApiOperation({
    summary: 'Record an incident against known ingredient batches',
    description:
      'Preserves observed batch identities and response history. Does not quarantine stock, dispose inventory, or infer production/transfer/affected-order links.',
  })
  @ApiBody({ schema: zodOpenApiSchema(createFoodIncidentSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(foodIncidentSchema) })
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createFoodIncidentSchema)) input: CreateFoodIncident,
  ): Promise<FoodIncident> {
    return this.incidents.create(actor, input);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List incident cases in the current restaurant' })
  @ApiZodQuery(foodIncidentQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(foodIncidentsSchema) })
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(foodIncidentQuerySchema)) query: FoodIncidentQuery,
  ): Promise<FoodIncidentList> {
    return this.incidents.list(actor, query);
  }

  @Get(':id/history')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read immutable incident response history' })
  @ApiZodQuery(foodIncidentHistoryQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(foodIncidentHistorySchema) })
  history(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(foodIncidentHistoryQuerySchema)) query: FoodIncidentHistoryQuery,
  ): Promise<FoodIncidentHistory> {
    return this.incidents.history(actor, id, query.page, query.pageSize);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read incident details and saved batch identities' })
  @ApiOkResponse({ schema: zodOpenApiSchema(foodIncidentSchema) })
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<FoodIncident> {
    return this.incidents.get(actor, id);
  }

  @Post(':id/entries')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(Permission.FOOD_INCIDENT_READ, Permission.FOOD_INCIDENT_MANAGE)
  @ApiOperation({ summary: 'Append a note, recall decision or corrective action to an open case' })
  @ApiBody({ schema: zodOpenApiSchema(addFoodIncidentEntrySchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(foodIncidentSchema) })
  append(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addFoodIncidentEntrySchema)) input: AddFoodIncidentEntry,
  ): Promise<FoodIncident> {
    return this.incidents.append(actor, id, input);
  }

  @Post(':id/resolve')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(Permission.FOOD_INCIDENT_READ, Permission.FOOD_INCIDENT_MANAGE)
  @ApiOperation({ summary: 'Resolve an open case, preserving original records and decisions' })
  @ApiBody({ schema: zodOpenApiSchema(resolveFoodIncidentSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(foodIncidentSchema) })
  resolve(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolveFoodIncidentSchema)) input: ResolveFoodIncident,
  ): Promise<FoodIncident> {
    return this.incidents.resolve(actor, id, input);
  }
}
