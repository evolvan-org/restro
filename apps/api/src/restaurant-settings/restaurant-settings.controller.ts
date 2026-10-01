import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type RestaurantSettingsResponse,
  restaurantSettingsResponseSchema,
  type UpdateRestaurantSettingsRequest,
  updateRestaurantSettingsRequestSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { RestaurantSettingsService } from './restaurant-settings.service';

@ApiTags('restaurant settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing the required restaurant permission'))
@Controller('restaurant/settings')
export class RestaurantSettingsController {
  constructor(private readonly restaurantSettingsService: RestaurantSettingsService) {}

  @Get()
  @RequirePermissions(Permission.RESTAURANT_READ)
  @ApiOperation({
    summary: 'View restaurant settings',
    description: "Returns the caller's own restaurant settings. Requires `restaurant:read`.",
  })
  @ApiOkResponse({
    description: 'The restaurant settings',
    schema: zodOpenApiSchema(restaurantSettingsResponseSchema),
  })
  @ApiNotFoundResponse(apiError('The restaurant no longer exists'))
  get(@CurrentActor() actor: Actor): Promise<RestaurantSettingsResponse> {
    return this.restaurantSettingsService.get(actor);
  }

  @Patch()
  @RequirePermissions(Permission.RESTAURANT_WRITE)
  @ApiOperation({
    summary: 'Update restaurant settings',
    description:
      "Replaces name, currency, timezone, GST number and default GST rate of the caller's own restaurant. An empty GST number clears it. Requires `restaurant:write`.",
  })
  @ApiBody({ schema: zodOpenApiSchema(updateRestaurantSettingsRequestSchema) })
  @ApiOkResponse({
    description: 'The updated restaurant settings',
    schema: zodOpenApiSchema(restaurantSettingsResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid currency, timezone, GST rate or other settings data'))
  @ApiNotFoundResponse(apiError('The restaurant no longer exists'))
  update(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(updateRestaurantSettingsRequestSchema))
    input: UpdateRestaurantSettingsRequest,
  ): Promise<RestaurantSettingsResponse> {
    return this.restaurantSettingsService.update(actor, input);
  }
}
