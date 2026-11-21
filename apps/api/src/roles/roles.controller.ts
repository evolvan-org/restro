import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  type CreateRoleRequest,
  createRoleRequestSchema,
  type DeleteRoleQuery,
  deleteRoleQuerySchema,
  type RoleAuditListResponse,
  roleAuditListResponseSchema,
  type RoleDetail,
  roleDetailSchema,
  type RoleListResponse,
  roleListResponseSchema,
  type UpdateRoleRequest,
  updateRoleRequestSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(
  apiError('Missing permission, or the change is not allowed (Owner role, own role, escalation)'),
)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions(Permission.ROLE_READ)
  @ApiOperation({
    summary: 'List roles',
    description: "Roles of the caller's restaurant with user counts. Requires `role:read`.",
  })
  @ApiOkResponse({ description: 'Roles', schema: zodOpenApiSchema(roleListResponseSchema) })
  list(@CurrentActor() actor: Actor): Promise<RoleListResponse> {
    return this.rolesService.list(actor);
  }

  @Get('audit')
  @RequirePermissions(Permission.ROLE_READ)
  @ApiOperation({
    summary: 'Role change history',
    description: 'Latest role and permission changes, newest first. Requires `role:read`.',
  })
  @ApiOkResponse({
    description: 'Audit entries',
    schema: zodOpenApiSchema(roleAuditListResponseSchema),
  })
  audit(@CurrentActor() actor: Actor): Promise<RoleAuditListResponse> {
    return this.rolesService.listAudit(actor);
  }

  @Get(':id')
  @RequirePermissions(Permission.ROLE_READ)
  @ApiOperation({
    summary: 'Get a role',
    description:
      'A role with its permissions, whether the caller may edit it, and which permissions they may grant. Requires `role:read`.',
  })
  @ApiOkResponse({ description: 'The role', schema: zodOpenApiSchema(roleDetailSchema) })
  @ApiNotFoundResponse(apiError('Role not found'))
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<RoleDetail> {
    return this.rolesService.get(actor, id);
  }

  @Post()
  @RequirePermissions(Permission.ROLE_WRITE)
  @ApiOperation({
    summary: 'Create a role',
    description:
      'Creates a blank role, or a copy of another role with `duplicateFromRoleId`. The caller can only grant permissions they hold. Requires `role:write`.',
  })
  @ApiCreatedResponse({ description: 'The new role', schema: zodOpenApiSchema(roleDetailSchema) })
  @ApiBadRequestResponse(apiError('Invalid role'))
  @ApiConflictResponse(apiError('A role with this name already exists'))
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createRoleRequestSchema)) body: CreateRoleRequest,
  ): Promise<RoleDetail> {
    return this.rolesService.create(actor, body);
  }

  @Patch(':id')
  @RequirePermissions(Permission.ROLE_WRITE)
  @ApiOperation({
    summary: 'Update a role',
    description:
      'Changes name, description and permissions. Default roles cannot be renamed; the Owner role and your own role cannot be edited. Requires `role:write`.',
  })
  @ApiOkResponse({ description: 'The updated role', schema: zodOpenApiSchema(roleDetailSchema) })
  @ApiNotFoundResponse(apiError('Role not found'))
  @ApiConflictResponse(apiError('A role with this name already exists'))
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRoleRequestSchema)) body: UpdateRoleRequest,
  ): Promise<RoleDetail> {
    return this.rolesService.update(actor, id, body);
  }

  @Post(':id/reset')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ROLE_WRITE)
  @ApiOperation({
    summary: 'Reset a default role',
    description: "Restores a default role's seeded permissions. Requires `role:write`.",
  })
  @ApiOkResponse({ description: 'The reset role', schema: zodOpenApiSchema(roleDetailSchema) })
  @ApiNotFoundResponse(apiError('Role not found'))
  reset(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<RoleDetail> {
    return this.rolesService.reset(actor, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.ROLE_WRITE)
  @ApiOperation({
    summary: 'Delete a role',
    description:
      'Deletes a custom role. If users still have it, pass `reassignToRoleId`; otherwise the request fails with the user count. Requires `role:write`.',
  })
  @ApiNoContentResponse({ description: 'Role deleted' })
  @ApiNotFoundResponse(apiError('Role not found'))
  @ApiConflictResponse(apiError('Users still have this role (includes `userCount`)'))
  async remove(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(deleteRoleQuerySchema)) query: DeleteRoleQuery,
  ): Promise<void> {
    await this.rolesService.remove(actor, id, query);
  }
}
