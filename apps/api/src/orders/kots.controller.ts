import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
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
  type UpdateKotStatusRequest,
  updateKotStatusRequestSchema,
  type UpdateKotStatusResponse,
  updateKotStatusResponseSchema,
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
@ApiForbiddenResponse(apiError('Missing the permission required by this route'))
@Controller('kots')
export class KotsController {
  constructor(private readonly service: OrdersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.KOT_READ)
  @ApiOperation({
    summary: "List a station's KOTs with items and table number, oldest first",
    description:
      'Paginated FIFO queue. Defaults to PENDING, PREPARING, READY; repeat status to include COMPLETED.',
  })
  @ApiZodQuery(kotQueueQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(kotQueueResponseSchema) })
  @ApiBadRequestResponse(apiError('Invalid destination, status, or pagination'))
  queue(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(kotQueueQuerySchema)) query: KotQueueQuery,
  ): Promise<KotQueueResponse> {
    return this.service.kotQueue(actor, query);
  }

  @Patch(':id/status')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.KOT_UPDATE_STATUS)
  @ApiOperation({
    summary: 'Advance a KOT to its next status and set all of its items to match',
  })
  @ApiBody({ schema: zodOpenApiSchema(updateKotStatusRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(updateKotStatusResponseSchema) })
  @ApiBadRequestResponse(apiError('Invalid id or status'))
  @ApiNotFoundResponse(apiError('KOT not found in the caller restaurant'))
  @ApiConflictResponse(apiError('Stale expected status or invalid KOT transition'))
  updateStatus(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateKotStatusRequestSchema)) input: UpdateKotStatusRequest,
  ): Promise<UpdateKotStatusResponse> {
    return this.service.updateKotStatus(actor, id, input);
  }
}
