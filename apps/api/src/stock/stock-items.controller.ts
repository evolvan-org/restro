import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type StockItem, stockItemListResponseSchema } from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { apiError, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { StockItemsService } from './stock-items.service';

@ApiTags('stock items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('The caller lacks the stock:read permission'))
@Controller('stock-items')
export class StockItemsController {
  constructor(private readonly service: StockItemsService) {}

  @Get()
  @RequirePermissions(Permission.STOCK_READ)
  @ApiOperation({ summary: 'List the active, seeded ingredient master for the recipe picker' })
  @ApiOkResponse({ schema: zodOpenApiSchema(stockItemListResponseSchema) })
  list(@CurrentActor() actor: Actor): Promise<StockItem[]> {
    return this.service.list(actor);
  }
}
