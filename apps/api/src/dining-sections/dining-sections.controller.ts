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
  type CreateDiningSectionRequest,
  createDiningSectionRequestSchema,
  type DiningSection,
  type DiningSectionListQuery,
  diningSectionListQuerySchema,
  type DiningSectionListResponse,
  diningSectionListResponseSchema,
  diningSectionSchema,
  type ReorderDiningSectionsRequest,
  reorderDiningSectionsRequestSchema,
  type UpdateDiningSectionRequest,
  updateDiningSectionRequestSchema,
  type UpdateDiningSectionStatusRequest,
  updateDiningSectionStatusRequestSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { DiningSectionsService } from './dining-sections.service';

@ApiTags('dining sections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('The caller lacks the required restaurant permission'))
@Controller('dining-sections')
export class DiningSectionsController {
  constructor(private readonly service: DiningSectionsService) {}

  @Get()
  @RequirePermissions(Permission.RESTAURANT_READ)
  @ApiOperation({ summary: 'List dining sections in configured order' })
  @ApiZodQuery(diningSectionListQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(diningSectionListResponseSchema) })
  @ApiBadRequestResponse(apiError('Invalid query parameters'))
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(diningSectionListQuerySchema)) query: DiningSectionListQuery,
  ): Promise<DiningSectionListResponse> {
    return this.service.list(actor, query);
  }

  @Post()
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({ summary: 'Create a dining section' })
  @ApiBody({ schema: zodOpenApiSchema(createDiningSectionRequestSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(diningSectionSchema) })
  @ApiBadRequestResponse(apiError('Invalid section data'))
  @ApiConflictResponse(apiError('A section with the same name already exists'))
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createDiningSectionRequestSchema))
    input: CreateDiningSectionRequest,
  ): Promise<DiningSection> {
    return this.service.create(actor, input);
  }

  @Patch('reorder')
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({ summary: 'Save the dining-section display order' })
  @ApiBody({ schema: zodOpenApiSchema(reorderDiningSectionsRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(diningSectionSchema.array()) })
  @ApiBadRequestResponse(apiError('The ordered list is invalid or stale'))
  reorder(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(reorderDiningSectionsRequestSchema))
    input: ReorderDiningSectionsRequest,
  ): Promise<DiningSection[]> {
    return this.service.reorder(actor, input);
  }

  @Patch(':id')
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({ summary: 'Update a dining section' })
  @ApiBody({ schema: zodOpenApiSchema(updateDiningSectionRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(diningSectionSchema) })
  @ApiBadRequestResponse(apiError('Invalid section data or id'))
  @ApiNotFoundResponse(apiError('No section with this id in the caller restaurant'))
  @ApiConflictResponse(apiError('A section with the same name already exists'))
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDiningSectionRequestSchema))
    input: UpdateDiningSectionRequest,
  ): Promise<DiningSection> {
    return this.service.update(actor, id, input);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({ summary: 'Activate or deactivate a dining section' })
  @ApiBody({ schema: zodOpenApiSchema(updateDiningSectionStatusRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(diningSectionSchema) })
  @ApiBadRequestResponse(apiError('Invalid status or id'))
  @ApiNotFoundResponse(apiError('No section with this id in the caller restaurant'))
  updateStatus(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDiningSectionStatusRequestSchema))
    input: UpdateDiningSectionStatusRequest,
  ): Promise<DiningSection> {
    return this.service.updateStatus(actor, id, input);
  }

  @Patch(':id/archive')
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({ summary: 'Archive a dining section without deleting it' })
  @ApiOkResponse({ schema: zodOpenApiSchema(diningSectionSchema) })
  @ApiBadRequestResponse(apiError('Invalid section id'))
  @ApiNotFoundResponse(apiError('No section with this id in the caller restaurant'))
  archive(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DiningSection> {
    return this.service.archive(actor, id);
  }
}
