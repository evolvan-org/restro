import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  aiQuotaErrorSchema,
  apiErrorCodeSchema,
  type ErrorResponse,
  onboardingDraftConflictErrorSchema,
  onboardingIncompleteErrorSchema,
  onboardingStageErrorSchema,
  orderAlreadyOpenErrorSchema,
} from '@rms/api-contract';
import type { Request, Response } from 'express';

export type MappedDbError = { status: HttpStatus; message: string };

/**
 * Validated extensions that may add data to the standard envelope. Each requires its own extra
 * field (or literal code), so at most one matches a given error.
 */
const ERROR_EXTENSIONS = [
  orderAlreadyOpenErrorSchema,
  onboardingIncompleteErrorSchema,
  onboardingStageErrorSchema,
  onboardingDraftConflictErrorSchema,
  aiQuotaErrorSchema,
] as const;

/** Extra properties an exception body may carry for one of `ERROR_EXTENSIONS`. */
const EXTENSION_FIELDS = [
  'existingOrder',
  'restaurantName',
  'stage',
  'draft',
  'limit',
  'used',
] as const;

/**
 * Maps Prisma errors to client-facing responses without importing the client
 * (matched by name/code so the filter stays decoupled from the DB package).
 * Returns null for anything that is not a recognised, client-attributable failure.
 */
export function mapDatabaseError(exception: unknown): MappedDbError | null {
  if (!(exception instanceof Error)) return null;

  if (exception.name === 'PrismaClientKnownRequestError') {
    const code = (exception as Error & { code?: string }).code;
    switch (code) {
      case 'P2000':
      case 'P2020':
        return { status: HttpStatus.BAD_REQUEST, message: 'A submitted value is out of range.' };
      case 'P2002':
        return { status: HttpStatus.CONFLICT, message: 'This record already exists.' };
      case 'P2003':
        return { status: HttpStatus.CONFLICT, message: 'A referenced record does not exist.' };
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, message: 'The requested record was not found.' };
      // Interactive transaction timed out (e.g. waiting on a busy lock) or hit a write conflict:
      // both are transient, so tell the client to retry instead of reporting a server fault.
      case 'P2028':
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'The system is busy with another update. Try again in a moment.',
        };
      case 'P2034':
        return {
          status: HttpStatus.CONFLICT,
          message: 'This record was changed by another request. Try again.',
        };
      default:
        return null;
    }
  }

  // Integer overflow surfaces as an unknown request error with no code.
  if (
    exception.name === 'PrismaClientUnknownRequestError' &&
    exception.message.includes('Unable to fit integer value')
  ) {
    return { status: HttpStatus.BAD_REQUEST, message: 'A submitted number is too large.' };
  }

  return null;
}

/**
 * Translates any thrown error into the standard error envelope documented in
 * docs/02-api-standards.md. Unknown errors become a 500 without leaking internals.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const dbError = isHttp ? null : mapDatabaseError(exception);
    const isEmailDeliveryError =
      !isHttp && exception instanceof Error && exception.name === 'EmailDeliveryError';
    const status = isHttp
      ? exception.getStatus()
      : isEmailDeliveryError
        ? HttpStatus.SERVICE_UNAVAILABLE
        : (dbError?.status ?? HttpStatus.INTERNAL_SERVER_ERROR);

    let message: string | string[] = dbError?.message ?? 'Internal server error';
    let error: string | undefined = dbError ? HttpStatus[dbError.status] : undefined;
    let code: ErrorResponse['code'];
    const extensionData: Record<string, unknown> = {};

    if (isEmailDeliveryError) {
      message = 'Email delivery is temporarily unavailable. Please try again.';
      error = 'Service Unavailable';
    }

    if (isHttp) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown> & {
          message?: string | string[];
          error?: string;
        };
        message = body.message ?? exception.message;
        error = body.error;
        code = apiErrorCodeSchema.safeParse(body.code).data;
        for (const field of EXTENSION_FIELDS) {
          if (body[field] !== undefined) extensionData[field] = body[field];
        }
      }
    } else if (dbError) {
      this.logger.warn(
        `Database error on ${request.method} ${request.url}: ${exception instanceof Error ? exception.message : ''}`,
      );
    } else if (!isEmailDeliveryError) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload: ErrorResponse = {
      statusCode: status,
      message,
      error,
      ...(code && { code }),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Only a validated extension may add data to the standard envelope.
    if (Object.keys(extensionData).length > 0) {
      for (const extension of ERROR_EXTENSIONS) {
        const parsed = extension.safeParse({ ...payload, ...extensionData });
        if (parsed.success) {
          response.status(status).json(parsed.data);
          return;
        }
      }
    }
    response.status(status).json(payload);
  }
}
