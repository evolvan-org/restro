import { z } from 'zod';
import { messageResponseSchema } from './common';
import { userEmailSchema, userPasswordSchema } from './user-fields';

export const loginRequestSchema = z.object({
  email: userEmailSchema,
  password: z.string().min(1),
});

export const loginResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  accessToken: z.string(),
});

export const registerRequestSchema = z.object({
  name: z.string().min(1),
  restaurantName: z.string().trim().min(1).max(255),
  email: userEmailSchema,
  password: userPasswordSchema,
});

export const registerResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  accessToken: z.string(),
  /** False when the account was created but the verification email could not be sent. */
  emailSent: z.boolean(),
});

const actionTokenSchema = z.string().trim().min(32, 'Invalid token');

export const verifyEmailRequestSchema = z.object({ token: actionTokenSchema }).strict();
export const resendVerificationResponseSchema = messageResponseSchema;
export const verifyEmailResponseSchema = messageResponseSchema;

export const forgotPasswordRequestSchema = z.object({ email: userEmailSchema }).strict();
export const forgotPasswordResponseSchema = messageResponseSchema;

export const resetPasswordRequestSchema = z
  .object({ token: actionTokenSchema, newPassword: userPasswordSchema })
  .strict();
export const resetPasswordResponseSchema = messageResponseSchema;

export const acceptInviteRequestSchema = z
  .object({ token: actionTokenSchema, password: userPasswordSchema })
  .strict();
export const acceptInviteResponseSchema = messageResponseSchema;

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type RegisterResponse = z.infer<typeof registerResponseSchema>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;
export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;
export type ResendVerificationResponse = z.infer<typeof resendVerificationResponseSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ForgotPasswordResponse = z.infer<typeof forgotPasswordResponseSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;
export type AcceptInviteResponse = z.infer<typeof acceptInviteResponseSchema>;
