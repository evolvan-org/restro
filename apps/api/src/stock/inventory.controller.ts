import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type AdjustInventoryStock,
  adjustInventoryStockSchema,
  type CreateInventoryItem,
  createInventoryItemSchema,
  type CreateInventoryPurchase,
  createInventoryPurchaseSchema,
  type CreateInventoryReceipt,
  createInventoryReceiptSchema,
  type CreateInventorySupplier,
  createInventorySupplierSchema,
  INVENTORY_CSV_MAX_BYTES,
  type InventoryBatch,
  inventoryBatchesSchema,
  type InventoryBatchQuery,
  inventoryBatchQuerySchema,
  type InventoryCsvImportResult,
  inventoryCsvImportResultSchema,
  type InventoryItem,
  type InventoryItemFilter,
  inventoryItemFilterSchema,
  type InventoryItemQuery,
  inventoryItemQuerySchema,
  inventoryItemSchema,
  inventoryItemsSchema,
  type InventoryMovement,
  type InventoryMovementQuery,
  inventoryMovementQuerySchema,
  inventoryMovementsSchema,
  type InventoryOptions,
  inventoryOptionsSchema,
  type InventoryPurchase,
  type InventoryPurchaseQuery,
  inventoryPurchaseQuerySchema,
  inventoryPurchaseSchema,
  inventoryPurchasesSchema,
  type InventoryReceipt,
  type InventoryReceiptQuery,
  inventoryReceiptQuerySchema,
  inventoryReceiptSchema,
  inventoryReceiptsSchema,
  type InventorySupplier,
  type InventorySupplierQuery,
  inventorySupplierQuerySchema,
  inventorySupplierSchema,
  inventorySuppliersSchema,
  type LogInventoryWaste,
  logInventoryWasteSchema,
  type OpeningInventoryStock,
  openingStockSchema,
  type ReceiptChecksRequest,
  receiptChecksRequestSchema,
  type ReceiptChecksResponse,
  receiptChecksResponseSchema,
  type UpdateInventoryItem,
  updateInventoryItemSchema,
  type UpdateInventoryPurchaseStatus,
  updateInventoryPurchaseStatusSchema,
  type UpdateInventorySupplier,
  updateInventorySupplierSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import type { Paginated } from '@rms/shared';

import { AiJobsService } from '../ai/jobs/ai-jobs.service';
import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@ApiUnauthorizedResponse(apiError('Authentication is required'))
@ApiForbiddenResponse(apiError('The caller lacks inventory management permission'))
@ApiBadRequestResponse(apiError('Inventory input is invalid'))
@ApiNotFoundResponse(apiError('The resource was not found in the restaurant'))
@ApiConflictResponse(apiError('The operation conflicts with the current inventory state'))
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.INVENTORY_MANAGE)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly scans: AiJobsService,
  ) {}

  @Get('options')
  @ApiOkResponse({ schema: zodOpenApiSchema(inventoryOptionsSchema) })
  options(@CurrentActor() actor: Actor): Promise<InventoryOptions> {
    return this.inventory.options(actor);
  }

  @Get('items')
  @ApiZodQuery(inventoryItemQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(inventoryItemsSchema) })
  items(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(inventoryItemQuerySchema)) query: InventoryItemQuery,
  ): Promise<Paginated<InventoryItem>> {
    return this.inventory.items(actor, query);
  }

  @Get('items/export')
  @ApiZodQuery(inventoryItemFilterSchema)
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="inventory.csv"')
  @Header('Cache-Control', 'private, no-store')
  exportCsv(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(inventoryItemFilterSchema)) filters: InventoryItemFilter,
  ): Promise<string> {
    return this.inventory.exportCsv(actor, filters);
  }

  @Post('items/import')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'UTF-8 inventory CSV' },
      },
    },
  })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(inventoryCsvImportResultSchema) })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: INVENTORY_CSV_MAX_BYTES + 1, files: 1, fields: 0 },
    }),
  )
  importCsv(
    @CurrentActor() actor: Actor,
    @UploadedFile() file?: { buffer: Buffer },
  ): Promise<InventoryCsvImportResult> {
    if (!file?.buffer.length) throw new BadRequestException('Select a CSV file to import');
    if (file.buffer.length > INVENTORY_CSV_MAX_BYTES) {
      throw new BadRequestException(
        `CSV files must be ${INVENTORY_CSV_MAX_BYTES / 1024} KB or smaller`,
      );
    }
    return this.inventory.importCsv(actor, file.buffer);
  }

  @Get('batches')
  @ApiZodQuery(inventoryBatchQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(inventoryBatchesSchema) })
  batches(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(inventoryBatchQuerySchema)) query: InventoryBatchQuery,
  ): Promise<Paginated<InventoryBatch>> {
    return this.inventory.batches(actor, query);
  }

  @Get('movements')
  @ApiZodQuery(inventoryMovementQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(inventoryMovementsSchema) })
  movements(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(inventoryMovementQuerySchema)) query: InventoryMovementQuery,
  ): Promise<Paginated<InventoryMovement>> {
    return this.inventory.movements(actor, query);
  }

  @Get('suppliers')
  @ApiZodQuery(inventorySupplierQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(inventorySuppliersSchema) })
  suppliers(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(inventorySupplierQuerySchema)) query: InventorySupplierQuery,
  ): Promise<Paginated<InventorySupplier>> {
    return this.inventory.suppliers(actor, query);
  }

  @Get('purchase-orders')
  @ApiZodQuery(inventoryPurchaseQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(inventoryPurchasesSchema) })
  purchases(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(inventoryPurchaseQuerySchema)) query: InventoryPurchaseQuery,
  ): Promise<Paginated<InventoryPurchase>> {
    return this.inventory.purchases(actor, query);
  }

  @Get('goods-receipts')
  @ApiZodQuery(inventoryReceiptQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(inventoryReceiptsSchema) })
  receipts(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(inventoryReceiptQuerySchema)) query: InventoryReceiptQuery,
  ): Promise<Paginated<InventoryReceipt>> {
    return this.inventory.receipts(actor, query);
  }

  @Post('items')
  @ApiBody({ schema: zodOpenApiSchema(createInventoryItemSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(inventoryItemSchema) })
  createItem(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createInventoryItemSchema)) input: CreateInventoryItem,
  ): Promise<InventoryItem> {
    return this.inventory.createItem(actor, input);
  }

  @Patch('items/:id')
  @ApiBody({ schema: zodOpenApiSchema(updateInventoryItemSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(inventoryItemSchema) })
  updateItem(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(updateInventoryItemSchema)) input: UpdateInventoryItem,
  ): Promise<InventoryItem> {
    return this.inventory.updateItem(actor, id, input);
  }

  @Post('items/:id/opening')
  @ApiBody({ schema: zodOpenApiSchema(openingStockSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(inventoryItemSchema) })
  openStock(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(openingStockSchema)) input: OpeningInventoryStock,
  ): Promise<InventoryItem> {
    return this.inventory.openStock(actor, id, input);
  }

  @Post('items/:id/adjustments')
  @ApiBody({ schema: zodOpenApiSchema(adjustInventoryStockSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(inventoryItemSchema) })
  adjust(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(adjustInventoryStockSchema)) input: AdjustInventoryStock,
  ): Promise<InventoryItem> {
    return this.inventory.adjust(actor, id, input);
  }

  @Post('batches/:id/waste')
  @ApiBody({ schema: zodOpenApiSchema(logInventoryWasteSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(inventoryItemSchema) })
  waste(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(logInventoryWasteSchema)) input: LogInventoryWaste,
  ): Promise<InventoryItem> {
    return this.inventory.waste(actor, id, input);
  }

  @Post('suppliers')
  @ApiBody({ schema: zodOpenApiSchema(createInventorySupplierSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(inventorySupplierSchema) })
  createSupplier(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createInventorySupplierSchema)) input: CreateInventorySupplier,
  ): Promise<InventorySupplier> {
    return this.inventory.createSupplier(actor, input);
  }

  @Patch('suppliers/:id')
  @ApiBody({ schema: zodOpenApiSchema(updateInventorySupplierSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(inventorySupplierSchema) })
  updateSupplier(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(updateInventorySupplierSchema)) input: UpdateInventorySupplier,
  ): Promise<InventorySupplier> {
    return this.inventory.updateSupplier(actor, id, input);
  }

  @Post('purchase-orders')
  @ApiBody({ schema: zodOpenApiSchema(createInventoryPurchaseSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(inventoryPurchaseSchema) })
  createPurchase(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createInventoryPurchaseSchema)) input: CreateInventoryPurchase,
  ): Promise<InventoryPurchase> {
    return this.inventory.createPurchase(actor, input);
  }

  @Patch('purchase-orders/:id/status')
  @ApiBody({ schema: zodOpenApiSchema(updateInventoryPurchaseStatusSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(inventoryPurchaseSchema) })
  updatePurchase(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(updateInventoryPurchaseStatusSchema))
    input: UpdateInventoryPurchaseStatus,
  ): Promise<InventoryPurchase> {
    return this.inventory.updatePurchase(actor, id, input);
  }

  @Post('goods-receipts')
  @ApiBody({ schema: zodOpenApiSchema(createInventoryReceiptSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(inventoryReceiptSchema) })
  @ApiConflictResponse(apiError('The supplier invoice number was already recorded'))
  async receive(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createInventoryReceiptSchema)) input: CreateInventoryReceipt,
  ): Promise<InventoryReceipt> {
    const receipt = await this.inventory.receive(actor, input);
    // The scanned invoice is now on record: its photos are no longer needed.
    if (input.scanJobId) await this.scans.purgeAfterUse(actor.restaurantId, [input.scanJobId]);
    return receipt;
  }

  @Post('goods-receipts/checks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Duplicate-invoice and price-jump warnings before saving a receipt' })
  @ApiBody({ schema: zodOpenApiSchema(receiptChecksRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(receiptChecksResponseSchema) })
  receiptChecks(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(receiptChecksRequestSchema)) input: ReceiptChecksRequest,
  ): Promise<ReceiptChecksResponse> {
    return this.inventory.receiptChecks(actor, input);
  }
}
