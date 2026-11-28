import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  messageResponseSchema,
  type ThermalCheckRequest,
  thermalCheckRequestSchema,
  type ThermalConfiguration,
  thermalConfigurationSchema,
  thermalConnectorCredentialSchema,
  type ThermalConnectorStatus,
  thermalConnectorStatusSchema,
  type ThermalDestination,
  thermalDestinationSchema,
  type ThermalDocument,
  thermalDocumentSchema,
  type ThermalKind,
  type ThermalPrinterStatus,
  thermalPrinterStatusSchema,
  type ThermalPrintRequest,
  thermalPrintRequestSchema,
  type ThermalSettings,
  thermalSettingsSchema,
  type ThermalTestRequest,
  thermalTestRequestSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import { actorCan } from '../common/auth/actor-permissions';
import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { ThermalPrintConnectorService } from './thermal-print-connector.service';
import { ThermalPrintingService } from './thermal-printing.service';

const kinds = { receipt: 'receipt', ticket: 'ticket' } as const;

@ApiTags('thermal printing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('thermal-printing')
export class ThermalPrintingController {
  constructor(
    private readonly service: ThermalPrintingService,
    private readonly connector: ThermalPrintConnectorService,
  ) {}

  @Get('connector')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ schema: zodOpenApiSchema(thermalConnectorStatusSchema) })
  connectorStatus(@CurrentActor() actor: Actor): Promise<ThermalConnectorStatus> {
    if (!actorCan(actor, Permission.SETTINGS_READ))
      throw new ForbiddenException('Missing restaurant settings permission');
    return this.connector.status(actor.restaurantId);
  }

  @Post('connector/rotate')
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ schema: zodOpenApiSchema(thermalConnectorCredentialSchema) })
  pairConnector(@CurrentActor() actor: Actor): Promise<{ token: string }> {
    if (!actorCan(actor, Permission.RESTAURANT_WRITE))
      throw new ForbiddenException('Missing restaurant settings write permission');
    return this.connector.rotate(actor.restaurantId);
  }

  @Post('connector/revoke')
  @HttpCode(204)
  revokeConnector(@CurrentActor() actor: Actor): Promise<void> {
    if (!actorCan(actor, Permission.RESTAURANT_WRITE))
      throw new ForbiddenException('Missing restaurant settings write permission');
    return this.connector.revoke(actor.restaurantId);
  }

  @Get('config')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ schema: zodOpenApiSchema(thermalPrinterStatusSchema) })
  config(@CurrentActor() actor: Actor): Promise<ThermalPrinterStatus> {
    if (!actorCan(actor, Permission.SETTINGS_READ))
      throw new ForbiddenException('Missing restaurant settings permission');
    return this.service.status(actor);
  }

  @Put('config/:destination')
  @ApiBody({ schema: zodOpenApiSchema(thermalSettingsSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(thermalConfigurationSchema) })
  save(
    @CurrentActor() actor: Actor,
    @Param('destination', new ZodValidationPipe(thermalDestinationSchema))
    destination: ThermalDestination,
    @Body(new ZodValidationPipe(thermalSettingsSchema)) input: ThermalSettings,
  ): Promise<ThermalConfiguration> {
    if (!actorCan(actor, Permission.RESTAURANT_WRITE))
      throw new ForbiddenException('Missing restaurant settings write permission');
    return this.service.save(actor, destination, input);
  }

  @Post('check')
  @HttpCode(200)
  @ApiBody({ schema: zodOpenApiSchema(thermalCheckRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(messageResponseSchema) })
  check(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(thermalCheckRequestSchema)) input: ThermalCheckRequest,
  ): Promise<{ message: string }> {
    if (!actorCan(actor, Permission.RESTAURANT_WRITE))
      throw new ForbiddenException('Missing restaurant settings write permission');
    return this.service.check(actor, input.destination, input.transport);
  }

  @Post('test')
  @HttpCode(200)
  @ApiBody({ schema: zodOpenApiSchema(thermalTestRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(messageResponseSchema) })
  test(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(thermalTestRequestSchema)) request: ThermalTestRequest,
  ): Promise<{ message: string }> {
    if (!actorCan(actor, Permission.RESTAURANT_WRITE))
      throw new ForbiddenException('Missing restaurant settings write permission');
    return this.service.test(actor, request);
  }

  @Get(':kind/:id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ schema: zodOpenApiSchema(thermalDocumentSchema) })
  preview(
    @CurrentActor() actor: Actor,
    @Param('kind', new ParseEnumPipe(kinds)) kind: ThermalKind,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ThermalDocument> {
    this.requireRead(actor, kind);
    return this.service.preview(actor, kind, id);
  }

  @Post(':kind/:id')
  @ApiBody({ schema: zodOpenApiSchema(thermalPrintRequestSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(messageResponseSchema) })
  print(
    @CurrentActor() actor: Actor,
    @Param('kind', new ParseEnumPipe(kinds)) kind: ThermalKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(thermalPrintRequestSchema)) body: ThermalPrintRequest,
  ): Promise<{ message: string }> {
    this.requireRead(actor, kind);
    return this.service.print(actor, kind, id, body);
  }

  private requireRead(actor: Actor, kind: ThermalKind): void {
    if (!actorCan(actor, kind === 'receipt' ? Permission.BILL_READ : Permission.KOT_READ)) {
      throw new ForbiddenException('Missing permission to print this document');
    }
  }
}
