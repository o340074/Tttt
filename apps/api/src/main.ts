import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { API_VERSION } from './health/health.service';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get(ConfigService<Env, true>);

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

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`AdVault API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
