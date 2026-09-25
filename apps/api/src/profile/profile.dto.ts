import {
  changePasswordRequestSchema,
  changePasswordResponseSchema,
  profileResponseSchema,
  updateProfileRequestSchema,
} from '@rms/api-contract';
import { createZodDto } from 'nestjs-zod';

// Swagger-only DTOs: OpenAPI is generated from the contract schemas so the docs can't drift.
// Request validation still goes through ZodValidationPipe to keep the error envelope.
export class ProfileResponseDto extends createZodDto(profileResponseSchema) {}
export class UpdateProfileRequestDto extends createZodDto(updateProfileRequestSchema) {}
export class ChangePasswordRequestDto extends createZodDto(changePasswordRequestSchema) {}
export class ChangePasswordResponseDto extends createZodDto(changePasswordResponseSchema) {}
