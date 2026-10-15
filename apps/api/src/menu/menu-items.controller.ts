import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
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
  type CreateMenuItemRequest,
  createMenuItemRequestSchema,
  type MenuItem,
  type MenuItemListQuery,
  menuItemListQuerySchema,
  menuItemListResponseSchema,
  menuItemSchema,
  type UpdateMenuItemAvailabilityRequest,
  updateMenuItemAvailabilityRequestSchema,
  type UpdateMenuItemClassificationRequest,
  updateMenuItemClassificationRequestSchema,
  type UpdateMenuItemPriceRequest,
  updateMenuItemPriceRequestSchema,
  type UpdateMenuItemRequest,
  updateMenuItemRequestSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { MenuItemsService } from './menu-items.service';

@ApiTags('menu items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('The caller lacks the required menu permission'))
@Controller('menu-items')
export class MenuItemsController {
  constructor(private readonly service: MenuItemsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.MENU_READ)
  @ApiOperation({ summary: 'List active menu items with their recipes, optionally by category' })
  @ApiZodQuery(menuItemListQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(menuItemListResponseSchema) })
  @ApiBadRequestResponse(apiError('Invalid query parameters'))
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(menuItemListQuerySchema)) query: MenuItemListQuery,
  ): Promise<MenuItem[]> {
    return this.service.list(actor, query);
  }

  @Post()
  @RequirePermissions(Permission.MENU_WRITE)
  @ApiOperation({ summary: 'Create a menu item with its (mandatory) recipe' })
  @ApiBody({ schema: zodOpenApiSchema(createMenuItemRequestSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(menuItemSchema) })
  @ApiBadRequestResponse(
    apiError('Invalid item data, empty/duplicate recipe or unknown ingredient'),
  )
  @ApiNotFoundResponse(apiError('Unknown category'))
  @ApiConflictResponse(apiError('An item with the same name already exists in the category'))
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createMenuItemRequestSchema)) input: CreateMenuItemRequest,
  ): Promise<MenuItem> {
    return this.service.create(actor, input);
  }

  @Patch(':id')
  @RequirePermissions(Permission.MENU_WRITE)
  @ApiOperation({ summary: 'Update item fields and/or fully replace its recipe' })
  @ApiBody({ schema: zodOpenApiSchema(updateMenuItemRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(menuItemSchema) })
  @ApiBadRequestResponse(
    apiError('Invalid item data, empty/duplicate recipe or unknown ingredient'),
  )
  @ApiNotFoundResponse(apiError('Unknown item or category'))
  @ApiConflictResponse(apiError('An item with the same name already exists in the category'))
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMenuItemRequestSchema)) input: UpdateMenuItemRequest,
  ): Promise<MenuItem> {
    return this.service.update(actor, id, input);
  }

  @Patch(':id/availability')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.MENU_WRITE)
  @ApiOperation({
    summary: 'Set item availability; setting the current value is a successful no-op',
  })
  @ApiBody({ schema: zodOpenApiSchema(updateMenuItemAvailabilityRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(menuItemSchema) })
  @ApiBadRequestResponse(apiError('Invalid item id or availability; isAvailable must be a boolean'))
  @ApiNotFoundResponse(apiError('No active item with this id in the caller restaurant'))
  updateAvailability(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMenuItemAvailabilityRequestSchema))
    input: UpdateMenuItemAvailabilityRequest,
  ): Promise<MenuItem> {
    return this.service.updateAvailability(actor, id, input);
  }

  @Patch(':id/price')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.MENU_WRITE)
  @ApiOperation({ summary: 'Update only the price of an active menu item' })
  @ApiBody({ schema: zodOpenApiSchema(updateMenuItemPriceRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(menuItemSchema) })
  @ApiBadRequestResponse(apiError('Invalid item id or price; see the shared price constraints'))
  @ApiNotFoundResponse(apiError('No active item with this id in the caller restaurant'))
  updatePrice(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMenuItemPriceRequestSchema))
    input: UpdateMenuItemPriceRequest,
  ): Promise<MenuItem> {
    return this.service.updatePrice(actor, id, input);
  }

  @Patch(':id/classification')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.MENU_WRITE)
  @ApiOperation({ summary: 'Set FOOD/BAR classification, matching the item category' })
  @ApiBody({ schema: zodOpenApiSchema(updateMenuItemClassificationRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(menuItemSchema) })
  @ApiBadRequestResponse(
    apiError('Invalid classification/id or classification differs from the category'),
  )
  @ApiNotFoundResponse(apiError('No active item with this id in the caller restaurant'))
  @ApiConflictResponse(
    apiError('The item or category changed during the update; refresh and retry'),
  )
  updateClassification(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMenuItemClassificationRequestSchema))
    input: UpdateMenuItemClassificationRequest,
  ): Promise<MenuItem> {
    return this.service.updateClassification(actor, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(Permission.MENU_WRITE)
  @ApiOperation({ summary: 'Soft-delete a menu item; its recipe rows are removed' })
  @ApiNoContentResponse({ description: 'Item deleted' })
  @ApiNotFoundResponse(apiError('No item with this id in the caller restaurant'))
  async remove(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.remove(actor, id);
  }
}
