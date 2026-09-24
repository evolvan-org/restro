import { z } from 'zod';

export const loginRequestSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

export const loginResponseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    accessToken: z.string(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;