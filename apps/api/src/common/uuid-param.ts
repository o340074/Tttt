import { ParseUUIDPipe } from '@nestjs/common';
import { ApiException } from './api-exception';

/**
 * A `ParseUUIDPipe` that fails with the unified Error envelope instead of the
 * default Nest 400 body (docs/backend/openapi.md). Use on `:id`-style params.
 */
export function uuidParam(): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () => new ApiException('VALIDATION_ERROR', 'id must be a UUID', 400),
  });
}
