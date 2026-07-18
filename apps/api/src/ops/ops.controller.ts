import { Controller, Get, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators';
import { ELEVATED } from '../auth/roles';
import { MetricsService } from './metrics.service';
import { formatPrometheus } from './ops.logic';
import type { OpsMetrics } from '@advault/types';

/**
 * Operational metrics surface (M5, docs/17 §3). Read-only monitoring signals —
 * ledger drift, notification-queue depth, stuck top-ups — for the ops team and
 * scrapers. Elevated (manager/admin) only; no mutations, so no AuditLog.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...ELEVATED)
@Controller('admin/ops')
export class OpsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  @ApiOkResponse({ description: 'Aggregated operational metrics (JSON).' })
  async json(): Promise<OpsMetrics> {
    return this.metrics.collect();
  }

  @Get('metrics.prom')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOkResponse({ description: 'Same metrics in Prometheus text-exposition format.' })
  async prometheus(): Promise<string> {
    return formatPrometheus(await this.metrics.collect());
  }
}
