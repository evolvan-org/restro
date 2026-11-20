import { z } from 'zod';
import { paginatedResponseSchema, paginationQuerySchema } from './common';
import { userEmailSchema, userNameSchema, userPhoneSchema } from './user-fields';

/** Account statuses shown by the staff list filter. */
export const staffStatusSchema = z.enum(['INVITED', 'ACTIVE', 'INACTIVE']);

/** Every stored account status (`SUSPENDED` exists in the DB but isn't managed by this feature). */
export const userStatusSchema = z.enum(['INVITED', 'ACTIVE', 'INACTIVE', 'SUSPENDED']);

export const staffRoleSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
  })
  .strict();

export const staffAccountSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    phone: z.string().nullable(),
    status: userStatusSchema,
    role: staffRoleSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const staffListQuerySchema = paginationQuerySchema.extend({
  search: z
    .string()
    .trim()
    .max(100, 'Search must be 100 characters or fewer')
    .optional()
    .describe('Case-insensitive match on name or email'),
  status: staffStatusSchema.optional(),
});

export const staffListResponseSchema = paginatedResponseSchema(staffAccountSchema);

/** Body for creating a pending staff account whose password is set from its invitation. */
export const createStaffRequestSchema = z
  .object({
    name: userNameSchema,
    email: userEmailSchema,
    phone: userPhoneSchema,
    roleId: z.string().uuid('Select a role'),
  })
  .strict();

/** Body for editing a staff account. Email is fixed at creation and cannot be changed. */
export const updateStaffRequestSchema = z
  .object({
    name: userNameSchema,
    phone: userPhoneSchema,
    roleId: z.string().uuid('Select a role'),
  })
  .strict();

export const createStaffResponseSchema = z
  .object({
    account: staffAccountSchema,
    message: z.string(),
    /** False when the account was created but the invitation email could not be sent. */
    emailSent: z.boolean(),
  })
  .strict();

export const staffEmailActionResponseSchema = z.object({ message: z.string() }).strict();

export const updateStaffStatusRequestSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE']),
  })
  .strict();

export const staffRolesResponseSchema = z.array(staffRoleSchema);

export type StaffStatus = z.infer<typeof staffStatusSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type StaffRole = z.infer<typeof staffRoleSchema>;
export type StaffAccount = z.infer<typeof staffAccountSchema>;
export type StaffListQuery = z.infer<typeof staffListQuerySchema>;
export type StaffListResponse = z.infer<typeof staffListResponseSchema>;
export type CreateStaffRequest = z.infer<typeof createStaffRequestSchema>;
export type CreateStaffResponse = z.infer<typeof createStaffResponseSchema>;
export type StaffEmailActionResponse = z.infer<typeof staffEmailActionResponseSchema>;
export type UpdateStaffRequest = z.infer<typeof updateStaffRequestSchema>;
export type UpdateStaffStatusRequest = z.infer<typeof updateStaffStatusRequestSchema>;
export type StaffRolesResponse = z.infer<typeof staffRolesResponseSchema>;
