import { ALL_PERMISSIONS, type Permission } from '@rms/permissions';
import { z } from 'zod';

const permissionKeySchema = z
  .string()
  .refine((key): key is Permission => (ALL_PERMISSIONS as readonly string[]).includes(key), {
    message: 'Unknown permission',
  });

export const roleNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a role name')
  .max(100, 'Role name must be at most 100 characters');

export const roleDescriptionSchema = z
  .string()
  .trim()
  .max(255, 'Description must be at most 255 characters');

export const roleSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    description: z.string().nullable(),
    /** Seeded default role: it cannot be renamed or deleted, and can be reset to its defaults. */
    isSystem: z.boolean(),
    /** The locked Account Owner role. */
    isOwner: z.boolean(),
    userCount: z.number().int().nonnegative(),
    /** Granted keys. Empty for the Owner role, which bypasses permission checks. */
    permissions: z.array(permissionKeySchema),
  })
  .strict();

export const roleUserSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    status: z.enum(['INVITED', 'ACTIVE', 'INACTIVE', 'SUSPENDED']),
  })
  .strict();

export const roleDetailSchema = roleSummarySchema
  .extend({
    /** Whether the caller may edit this role: `role:write`, not their own role, not the Owner. */
    editable: z.boolean(),
    /** Permission keys the caller may grant or revoke (the ones they hold themselves). */
    grantable: z.array(permissionKeySchema),
    /** First people holding the role (capped), for the details panel. */
    users: z.array(roleUserSchema),
  })
  .strict();

export const roleListResponseSchema = z
  .object({
    items: z.array(roleSummarySchema),
    /** Permission keys the caller may grant or revoke (the ones they hold themselves). */
    grantable: z.array(permissionKeySchema),
    /** The caller's own role: it can't be edited by them. */
    actorRoleId: z.string().uuid(),
    /** The caller's role name, for explaining locked cells. */
    actorRoleName: z.string(),
    canWrite: z.boolean(),
  })
  .strict();

/** Saves permission changes for several roles at once, atomically. */
export const updateRolePermissionsRequestSchema = z
  .object({
    changes: z
      .array(
        z.object({ roleId: z.string().uuid(), permissions: z.array(permissionKeySchema) }).strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine((value) => new Set(value.changes.map((c) => c.roleId)).size === value.changes.length, {
    message: 'Each role may appear once',
  });

export const createRoleRequestSchema = z
  .object({
    name: roleNameSchema,
    description: roleDescriptionSchema.optional(),
    /** Start from another role's permissions ("Duplicate"). */
    duplicateFromRoleId: z.string().uuid().optional(),
    /** Defaults to the duplicated role's permissions, or none for a blank role. */
    permissions: z.array(permissionKeySchema).optional(),
  })
  .strict();

export const updateRoleRequestSchema = z
  .object({
    name: roleNameSchema.optional(),
    description: roleDescriptionSchema.nullable().optional(),
    permissions: z.array(permissionKeySchema).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const deleteRoleQuerySchema = z
  .object({ reassignToRoleId: z.string().uuid().optional() })
  .strict();

export const roleAuditEntrySchema = z
  .object({
    id: z.string().uuid(),
    roleName: z.string(),
    action: z.enum(['CREATED', 'UPDATED', 'RESET', 'DELETED']),
    actorName: z.string().nullable(),
    addedKeys: z.array(z.string()),
    removedKeys: z.array(z.string()),
    createdAt: z.string().datetime(),
  })
  .strict();

export const roleAuditListResponseSchema = z
  .object({ items: z.array(roleAuditEntrySchema) })
  .strict();

export type RoleUser = z.infer<typeof roleUserSchema>;
export type UpdateRolePermissionsRequest = z.infer<typeof updateRolePermissionsRequestSchema>;
export type RoleSummary = z.infer<typeof roleSummarySchema>;
export type RoleDetail = z.infer<typeof roleDetailSchema>;
export type RoleListResponse = z.infer<typeof roleListResponseSchema>;
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;
export type DeleteRoleQuery = z.infer<typeof deleteRoleQuerySchema>;
export type RoleAuditEntry = z.infer<typeof roleAuditEntrySchema>;
export type RoleAuditListResponse = z.infer<typeof roleAuditListResponseSchema>;
