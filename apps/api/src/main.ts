import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { swaggerCspRelaxation } from './common/security';
import { API_VERSION } from './health/health.service';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  // rawBody keeps the exact webhook bytes available for signature checks.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  const config = app.get(ConfigService<Env, true>);

  // Swagger UI is a dev/staging tool — never expose the API surface map in
  // production. Its inline assets need a relaxed CSP layered on the docs route.
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    app.use('/api/docs', swaggerCspRelaxation());
    const swaggerConfig = new DocumentBuilder()
      .setTitle('AdVault API')
      .setDescription(
        'Digital goods marketplace API. Contract source of truth: docs/backend/openapi.md',
      )
      .setVersion(API_VERSION)
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`AdVault API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
