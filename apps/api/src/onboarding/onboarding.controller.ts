import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
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
  type ApiBodyOptions,
  ApiConflictResponse,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type CompleteOnboardingRequest,
  completeOnboardingRequestSchema,
  type CompleteOnboardingResponse,
  completeOnboardingResponseSchema,
  INVENTORY_CSV_MAX_BYTES,
  ONBOARDING_MENU_CSV_MAX_BYTES,
  onboardingDraftConflictErrorSchema,
  type OnboardingEmailAvailabilityQuery,
  onboardingEmailAvailabilityQuerySchema,
  type OnboardingEmailAvailabilityResponse,
  onboardingEmailAvailabilityResponseSchema,
  type OnboardingInventoryPreviewResponse,
  onboardingInventoryPreviewResponseSchema,
  type OnboardingMenuPreviewResponse,
  onboardingMenuPreviewResponseSchema,
  onboardingStageErrorSchema,
  type OnboardingStateResponse,
  onboardingStateResponseSchema,
  type SaveOnboardingDraftRequest,
  saveOnboardingDraftRequestSchema,
  type SaveOnboardingDraftResponse,
  saveOnboardingDraftResponseSchema,
  type SetupChecklistResponse,
  setupChecklistResponseSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import { AllowDuringSetup } from '../common/auth/allow-during-setup.decorator';
import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { OnboardingService } from './onboarding.service';

const csvUploadBody: ApiBodyOptions = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: { file: { type: 'string', format: 'binary', description: 'UTF-8 CSV' } },
  },
};

function requireCsv(file: { buffer: Buffer } | undefined, maxBytes: number): Buffer {
  if (!file?.buffer.length) throw new BadRequestException('Select a CSV file to upload');
  if (file.buffer.length > maxBytes) {
    throw new BadRequestException(`CSV files must be ${maxBytes / 1024} KB or smaller`);
  }
  return file.buffer;
}

@ApiTags('onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AllowDuringSetup()
@RequirePermissions(Permission.ONBOARDING_MANAGE)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Only the restaurant owner can run setup'))
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  @ApiOperation({ summary: "The owner's setup status and saved draft" })
  @ApiOkResponse({ schema: zodOpenApiSchema(onboardingStateResponseSchema) })
  getState(@CurrentActor() actor: Actor): Promise<OnboardingStateResponse> {
    return this.onboarding.getState(actor);
  }

  @Put('draft')
  @ApiOperation({
    summary: 'Save the setup draft',
    description: 'Nothing is written to business tables. A stale `version` is rejected.',
  })
  @ApiBody({ schema: zodOpenApiSchema(saveOnboardingDraftRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(saveOnboardingDraftResponseSchema) })
  @ApiConflictResponse({
    description: 'Saved elsewhere since it was loaded (latest draft attached), or setup is done',
    schema: zodOpenApiSchema(onboardingDraftConflictErrorSchema),
  })
  saveDraft(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(saveOnboardingDraftRequestSchema))
    input: SaveOnboardingDraftRequest,
  ): Promise<SaveOnboardingDraftResponse> {
    return this.onboarding.saveDraft(actor, input);
  }

  @Post('menu/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Parse and check a menu CSV without saving anything' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(csvUploadBody)
  @ApiOkResponse({ schema: zodOpenApiSchema(onboardingMenuPreviewResponseSchema) })
  @ApiBadRequestResponse(apiError('The file is not a readable menu CSV'))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: ONBOARDING_MENU_CSV_MAX_BYTES + 1, files: 1, fields: 0 },
    }),
  )
  previewMenu(@UploadedFile() file?: { buffer: Buffer }): OnboardingMenuPreviewResponse {
    return this.onboarding.previewMenu(requireCsv(file, ONBOARDING_MENU_CSV_MAX_BYTES));
  }

  @Post('inventory/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Parse and check an inventory CSV without saving anything',
    description: 'Accepts the same file format as Inventory › Import.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(csvUploadBody)
  @ApiOkResponse({ schema: zodOpenApiSchema(onboardingInventoryPreviewResponseSchema) })
  @ApiBadRequestResponse(apiError('The file is not a readable inventory CSV'))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: INVENTORY_CSV_MAX_BYTES + 1, files: 1, fields: 0 },
    }),
  )
  previewInventory(@UploadedFile() file?: { buffer: Buffer }): OnboardingInventoryPreviewResponse {
    return this.onboarding.previewInventory(requireCsv(file, INVENTORY_CSV_MAX_BYTES));
  }

  @Get('email-available')
  @ApiOperation({ summary: 'Whether an email can be used for a new team account' })
  @ApiZodQuery(onboardingEmailAvailabilityQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(onboardingEmailAvailabilityResponseSchema) })
  emailAvailable(
    @Query(new ZodValidationPipe(onboardingEmailAvailabilityQuerySchema))
    query: OnboardingEmailAvailabilityQuery,
  ): Promise<OnboardingEmailAvailabilityResponse> {
    return this.onboarding.emailAvailable(query.email);
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finish setup',
    description:
      'Creates everything in one transaction, or nothing, then emails each team member an ' +
      'invitation to set their password. Calling it again after success returns 409 ' +
      'ONBOARDING_ALREADY_COMPLETED.',
  })
  @ApiBody({ schema: zodOpenApiSchema(completeOnboardingRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(completeOnboardingResponseSchema) })
  @ApiBadRequestResponse({
    description: 'A filled-in step is invalid, or a stage failed; `stage` names it',
    schema: zodOpenApiSchema(onboardingStageErrorSchema),
  })
  @ApiConflictResponse(apiError('Setup is already finished, or a team email is taken'))
  complete(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(completeOnboardingRequestSchema)) input: CompleteOnboardingRequest,
  ): Promise<CompleteOnboardingResponse> {
    return this.onboarding.complete(actor, input);
  }

  @Get('checklist')
  @RequirePermissions(Permission.MENU_WRITE)
  @ApiOperation({ summary: 'What is still worth setting up, for the dashboard checklist' })
  @ApiOkResponse({ schema: zodOpenApiSchema(setupChecklistResponseSchema) })
  checklist(@CurrentActor() actor: Actor): Promise<SetupChecklistResponse> {
    return this.onboarding.checklist(actor);
  }
}
