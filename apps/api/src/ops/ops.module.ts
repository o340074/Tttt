import { Global, Module } from '@nestjs/common';
import { ErrorReporter } from './error-reporter';
import { MetricsService } from './metrics.service';
import { OpsController } from './ops.controller';

/**
 * Ops / observability (M5, docs/17 §3). Exposes monitoring metrics under RBAC
 * and provides the ErrorReporter used by the global exception filter. Global so
 * ErrorReporter is resolvable from app.setup (it wires the filter) without an
 * import cycle. MetricsService reads PrismaService (global) and the global
 * NotificationsService for queue depth.
 */
@Global()
@Module({
  controllers: [OpsController],
  providers: [MetricsService, ErrorReporter],
  exports: [ErrorReporter],
})
export class OpsModule {}
