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
  type CreateMenuCategoryRequest,
  createMenuCategoryRequestSchema,
  type MenuCategory,
  type MenuCategoryListQuery,
  menuCategoryListQuerySchema,
  menuCategoryListResponseSchema,
  menuCategorySchema,
  type ReorderMenuCategoriesRequest,
  reorderMenuCategoriesRequestSchema,
  reorderMenuCategoriesResponseSchema,
  type UpdateMenuCategoryRequest,
  updateMenuCategoryRequestSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { MenuCategoriesService } from './menu-categories.service';

@ApiTags('menu categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('The caller lacks the required menu permission'))
@Controller('menu-categories')
export class MenuCategoriesController {
  constructor(private readonly service: MenuCategoriesService) {}

  @Get()
  @RequirePermissions(Permission.MENU_READ)
  @ApiOperation({ summary: 'List menu categories ordered by sortOrder' })
  @ApiZodQuery(menuCategoryListQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(menuCategoryListResponseSchema) })
  @ApiBadRequestResponse(apiError('Invalid query parameters'))
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(menuCategoryListQuerySchema)) query: MenuCategoryListQuery,
  ): Promise<MenuCategory[]> {
    return this.service.list(actor, query);
  }

  @Post()
  @RequirePermissions(Permission.MENU_WRITE)
  @ApiOperation({ summary: 'Create a menu category' })
  @ApiBody({ schema: zodOpenApiSchema(createMenuCategoryRequestSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(menuCategorySchema) })
  @ApiBadRequestResponse(apiError('Invalid category data'))
  @ApiConflictResponse(apiError('A category with the same name already exists'))
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createMenuCategoryRequestSchema))
    input: CreateMenuCategoryRequest,
  ): Promise<MenuCategory> {
    return this.service.create(actor, input);
  }

  // Declared before `:id` so "reorder" is never parsed as a category id.
  @Patch('reorder')
  @RequirePermissions(Permission.MENU_WRITE)
  @ApiOperation({ summary: 'Save the menu-category display order' })
  @ApiBody({ schema: zodOpenApiSchema(reorderMenuCategoriesRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(reorderMenuCategoriesResponseSchema) })
  @ApiBadRequestResponse(apiError('The ordered list is invalid or stale'))
  reorder(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(reorderMenuCategoriesRequestSchema))
    input: ReorderMenuCategoriesRequest,
  ): Promise<MenuCategory[]> {
    return this.service.reorder(actor, input);
  }

  @Patch(':id')
  @RequirePermissions(Permission.MENU_WRITE)
  @ApiOperation({ summary: 'Update a menu category (name, type, sort order, active state)' })
  @ApiBody({ schema: zodOpenApiSchema(updateMenuCategoryRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(menuCategorySchema) })
  @ApiBadRequestResponse(apiError('Invalid category data or id'))
  @ApiNotFoundResponse(apiError('No category with this id in the caller restaurant'))
  @ApiConflictResponse(apiError('A category with the same name already exists'))
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMenuCategoryRequestSchema))
    input: UpdateMenuCategoryRequest,
  ): Promise<MenuCategory> {
    return this.service.update(actor, id, input);
  }
}
