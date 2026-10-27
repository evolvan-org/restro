import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type KotQueueQuery,
  kotQueueQuerySchema,
  type KotQueueResponse,
  kotQueueResponseSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { OrdersService } from './orders.service';

@ApiTags('kots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing kot:read permission'))
@Controller('kots')
export class KotsController {
  constructor(private readonly service: OrdersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.KOT_READ)
  @ApiOperation({
    summary: "List a station's KOTs with items and table number, oldest first",
    description:
      'Defaults to the active set (PENDING, PREPARING, READY); pass status explicitly (repeatable) to include COMPLETED.',
  })
  @ApiZodQuery(kotQueueQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(kotQueueResponseSchema) })
  @ApiBadRequestResponse(apiError('Invalid destination or status'))
  queue(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(kotQueueQuerySchema)) query: KotQueueQuery,
  ): Promise<KotQueueResponse> {
    return this.service.kotQueue(actor, query);
  }
}
