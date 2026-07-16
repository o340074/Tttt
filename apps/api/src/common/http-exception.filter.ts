import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { ApiError, ApiErrorCode } from '@advault/types';
import { ApiException } from './api-exception';
import type { ErrorReporter } from '../ops/error-reporter';

const STATUS_CODES: Record<number, ApiErrorCode> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/**
 * Maps every exception to the unified Error envelope
 * (docs/backend/openapi.md → components.schemas.Error).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  /**
   * The reporter is optional so unit tests (and any construction outside DI)
   * work without it. When present, only unexpected 5xx (unhandled) errors are
   * forwarded — client errors (4xx) and known ApiExceptions are expected and
   * would only add noise.
   */
  constructor(private readonly reporter?: ErrorReporter) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();

    if (exception instanceof ApiException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof ThrottlerException) {
      const body: ApiError = {
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
      };
      response.status(HttpStatus.TOO_MANY_REQUESTS).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const message =
        typeof raw === 'string'
          ? raw
          : ((raw as { message?: string | string[] }).message ?? exception.message);
      const body: ApiError = {
        error: {
          code: STATUS_CODES[status] ?? 'INTERNAL_ERROR',
          message: Array.isArray(message) ? message.join('; ') : message,
          ...(Array.isArray(message) ? { details: { messages: message } } : {}),
        },
      };
      response.status(status).json(body);
      return;
    }

    this.logger.error(
      `Unhandled exception: ${(exception as Error).message}`,
      (exception as Error).stack,
    );
    // Forward the unexpected failure to Sentry (best-effort, fire-and-forget).
    // Only method/path/status travel with it — never the body/headers/payload.
    if (this.reporter?.enabled) {
      const request = http.getRequest<Request>();
      void this.reporter.captureException(exception, {
        method: request?.method,
        path: request?.path,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    }
    const body: ApiError = {
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}
