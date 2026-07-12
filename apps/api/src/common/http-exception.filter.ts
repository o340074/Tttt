import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import type { ApiError, ApiErrorCode } from '@advault/types';
import { ApiException } from './api-exception';

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

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

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
    const body: ApiError = {
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}
