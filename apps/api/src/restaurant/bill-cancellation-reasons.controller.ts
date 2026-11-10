import {
  Body,
  Controller,
  Get,
  Header,
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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type CreateBillCancellationReasonRequest,
  createBillCancellationReasonRequestSchema,
  type DeactivateBillCancellationReasonRequest,
  deactivateBillCancellationReasonRequestSchema,
  type ManagedBillCancellationReason,
  type ManagedBillCancellationReasonListQuery,
  managedBillCancellationReasonListQuerySchema,
  type ManagedBillCancellationReasonListResponse,
  managedBillCancellationReasonListResponseSchema,
  managedBillCancellationReasonSchema,
  type RenameBillCancellationReasonRequest,
  renameBillCancellationReasonRequestSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { BillCancellationReasonsService } from './bill-cancellation-reasons.service';

@ApiTags('restaurant settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.RESTAURANT_WRITE)
@ApiUnauthorizedResponse(apiError('Authentication required'))
@ApiForbiddenResponse(apiError('Missing restaurant settings edit permission'))
@ApiBadRequestResponse(apiError('Invalid reason, pagination, or identifier'))
@ApiNotFoundResponse(apiError('Bill cancellation reason not found in the caller restaurant'))
@Controller('restaurant/settings/bill-cancellation-reasons')
export class BillCancellationReasonsController {
  constructor(private readonly reasons: BillCancellationReasonsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List active and inactive bill cancellation reasons for management' })
  @ApiZodQuery(managedBillCancellationReasonListQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(managedBillCancellationReasonListResponseSchema) })
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(managedBillCancellationReasonListQuerySchema))
    query: ManagedBillCancellationReasonListQuery,
  ): Promise<ManagedBillCancellationReasonListResponse> {
    return this.reasons.list(actor, query);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Add a bill cancellation reason to the caller restaurant' })
  @ApiBody({ schema: zodOpenApiSchema(createBillCancellationReasonRequestSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(managedBillCancellationReasonSchema) })
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createBillCancellationReasonRequestSchema))
    input: CreateBillCancellationReasonRequest,
  ): Promise<ManagedBillCancellationReason> {
    return this.reasons.create(actor, input);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Rename a reason without rewriting existing cancelled bills' })
  @ApiBody({ schema: zodOpenApiSchema(renameBillCancellationReasonRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(managedBillCancellationReasonSchema) })
  rename(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(renameBillCancellationReasonRequestSchema))
    input: RenameBillCancellationReasonRequest,
  ): Promise<ManagedBillCancellationReason> {
    return this.reasons.rename(actor, id, input);
  }

  @Patch(':id/deactivate')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Deactivate a reason; preserve the catalog row and existing bill text' })
  @ApiBody({ schema: zodOpenApiSchema(deactivateBillCancellationReasonRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(managedBillCancellationReasonSchema) })
  deactivate(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(deactivateBillCancellationReasonRequestSchema))
    _input: DeactivateBillCancellationReasonRequest,
  ): Promise<ManagedBillCancellationReason> {
    return this.reasons.deactivate(actor, id);
  }
}
