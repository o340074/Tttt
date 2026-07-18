import { HttpException } from '@nestjs/common';
import type { ApiErrorCode } from '@advault/types';

/**
 * Domain exception carrying the unified Error envelope
 * (docs/backend/openapi.md → components.schemas.Error).
 */
export class ApiException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super({ error: { code, message, ...(details ? { details } : {}) } }, status);
  }
}
