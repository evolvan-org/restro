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
  createStaffRequestSchema,
  createStaffResponseSchema,
  staffAccountSchema,
  staffListQuerySchema,
  staffListResponseSchema,
  staffRolesResponseSchema,
  updateStaffRequestSchema,
  updateStaffStatusRequestSchema,
  type CreateStaffRequest,
  type CreateStaffResponse,
  type StaffAccount,
  type StaffListQuery,
  type StaffListResponse,
  type StaffRolesResponse,
  type UpdateStaffRequest,
  type UpdateStaffStatusRequest,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ApiZodQuery, apiError, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { StaffService } from './staff.service';

@ApiTags('staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(
  apiError(
    'Missing permission, or not allowed on this account (your own role or status, or a role above yours)',
  ),
)
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @RequirePermissions(Permission.USER_READ)
  @ApiOperation({
    summary: 'List staff accounts',
    description:
      "Active and inactive staff of the caller's restaurant, sorted by name. Requires `user:read`.",
  })
  @ApiZodQuery(staffListQuerySchema)
  @ApiOkResponse({
    description: 'A page of staff accounts',
    schema: zodOpenApiSchema(staffListResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid query parameters'))
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(staffListQuerySchema)) query: StaffListQuery,
  ): Promise<StaffListResponse> {
    return this.staffService.list(actor, query);
  }

  @Get('roles')
  @RequirePermissions(Permission.USER_WRITE)
  @ApiOperation({
    summary: 'List assignable roles',
    description: 'Roles the caller may assign to staff accounts. Requires `user:write`.',
  })
  @ApiOkResponse({
    description: 'Assignable roles',
    schema: zodOpenApiSchema(staffRolesResponseSchema),
  })
  listRoles(@CurrentActor() actor: Actor): Promise<StaffRolesResponse> {
    return this.staffService.listAssignableRoles(actor);
  }

  @Post()
  @RequirePermissions(Permission.USER_WRITE)
  @ApiOperation({
    summary: 'Create a staff account',
    description:
      'Creates an active account with the selected role and a generated temporary password, returned only in this response. Requires `user:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(createStaffRequestSchema) })
  @ApiCreatedResponse({
    description: 'The created account',
    schema: zodOpenApiSchema(createStaffResponseSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid data, or the role cannot be assigned'))
  @ApiConflictResponse(apiError('The email address is already in use'))
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createStaffRequestSchema)) input: CreateStaffRequest,
  ): Promise<CreateStaffResponse> {
    return this.staffService.create(actor, input);
  }

  @Patch(':id')
  @RequirePermissions(Permission.USER_WRITE)
  @ApiOperation({
    summary: 'Update a staff account',
    description:
      'Updates name, email, phone and role. You cannot change your own role. Requires `user:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(updateStaffRequestSchema) })
  @ApiOkResponse({
    description: 'The updated account',
    schema: zodOpenApiSchema(staffAccountSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid data, or the role cannot be assigned'))
  @ApiNotFoundResponse(apiError('No staff account with this id in your restaurant'))
  @ApiConflictResponse(apiError('The email address is already in use'))
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStaffRequestSchema)) input: UpdateStaffRequest,
  ): Promise<StaffAccount> {
    return this.staffService.update(actor, id, input);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.USER_WRITE)
  @ApiOperation({
    summary: 'Activate or deactivate a staff account',
    description:
      'Inactive accounts cannot log in. You cannot change your own status. Requires `user:write`.',
  })
  @ApiBody({ schema: zodOpenApiSchema(updateStaffStatusRequestSchema) })
  @ApiOkResponse({
    description: 'The updated account',
    schema: zodOpenApiSchema(staffAccountSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid id or status'))
  @ApiNotFoundResponse(apiError('No staff account with this id in your restaurant'))
  updateStatus(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStaffStatusRequestSchema)) input: UpdateStaffStatusRequest,
  ): Promise<StaffAccount> {
    return this.staffService.updateStatus(actor, id, input);
  }
}
