import { ValidationPipe } from '@nestjs/common';
import type { INestApplication, ValidationError } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { ApiException } from './common/api-exception';
import { HttpExceptionFilter } from './common/http-exception.filter';
import type { Env } from './config/env';

function flattenValidationErrors(errors: ValidationError[], parent = ''): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) out[path] = Object.values(error.constraints);
    if (error.children?.length) Object.assign(out, flattenValidationErrors(error.children, path));
  }
  return out;
}

/** Shared app configuration — used by main.ts and the e2e smoke test. */
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get(ConfigService<Env, true>);

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new ApiException('VALIDATION_ERROR', 'Request validation failed', 400, {
          fields: flattenValidationErrors(errors),
        }),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }).split(','),
    credentials: true,
  });
  app.enableShutdownHooks();
  return app;
}
