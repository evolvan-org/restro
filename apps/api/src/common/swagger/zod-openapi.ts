import { applyDecorators } from '@nestjs/common';
import { ApiQuery, type ApiResponseOptions } from '@nestjs/swagger';
import { errorResponseSchema } from '@rms/api-contract';
import { zodV3ToOpenAPI } from 'nestjs-zod';
import type { z } from 'zod';

type OpenApiSchema = ReturnType<typeof zodV3ToOpenAPI>;
type NestZodSchema = Parameters<typeof zodV3ToOpenAPI>[0];

/**
 * OpenAPI schema generated from a `@rms/api-contract` Zod schema, for
 * `@ApiBody({ schema })` / `@ApiOkResponse({ schema })`, so Swagger can't drift from the contract.
 *
 * The only place that converts Zod to OpenAPI: when the project moves to Zod 4, switch this to
 * its native `z.toJSONSchema()` and every endpoint follows.
 */
export function zodOpenApiSchema(schema: z.ZodTypeAny): OpenApiSchema {
  // nestjs-zod declares its parameter against `zod/v3`, the same Zod 3 build the contract imports
  // as `zod`. TypeScript can't compare the two declaration trees, so they are bridged here once.
  return zodV3ToOpenAPI(schema as unknown as NestZodSchema);
}

/** Documents each field of a contract query schema as an `@ApiQuery` parameter. */
export function ApiZodQuery(schema: z.AnyZodObject): MethodDecorator {
  const shape = schema.shape as Record<string, z.ZodTypeAny>;

  return applyDecorators(
    ...Object.entries(shape).map(([name, field]) =>
      ApiQuery({
        name,
        required: !field.isOptional(),
        description: field.description,
        schema: zodOpenApiSchema(field),
      }),
    ),
  );
}

/**
 * Options for an error response decorator (`@ApiBadRequestResponse(apiError('...'))`, ...) that
 * show the standard error envelope every failure is returned in.
 */
export function apiError(description: string): ApiResponseOptions {
  return { description, schema: zodOpenApiSchema(errorResponseSchema) };
}
