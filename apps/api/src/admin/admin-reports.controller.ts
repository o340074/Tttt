import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators';
import { REPORTS_STAFF } from '../auth/roles';
import { resolveLocale } from '../catalog/locale';
import { AdminReportsService } from './admin-reports.service';
import { ReportPeriodDto } from './dto/admin-reports.dto';
import type {
  DashboardSummary,
  FulfillmentReport,
  OperatorLoadReport,
  SalesReport,
} from '@advault/types';

/**
 * Reports / analytics (docs/13 §1, §14). Read-only aggregates over orders,
 * warming jobs and the ledger. Manager+ only — revenue/SLA/operator-load is
 * oversight data. No mutations, so no AuditLog here.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...REPORTS_STAFF)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get('dashboard')
  async dashboard(@Query() query: ReportPeriodDto): Promise<DashboardSummary> {
    return this.reports.dashboard(this.period(query));
  }

  @Get('sales')
  async sales(
    @Query() query: ReportPeriodDto & { locale?: string },
  ): Promise<SalesReport> {
    return this.reports.sales(this.period(query), resolveLocale(query.locale));
  }

  @Get('fulfillment')
  async fulfillment(@Query() query: ReportPeriodDto): Promise<FulfillmentReport> {
    return this.reports.fulfillment(this.period(query));
  }

  @Get('operators')
  async operators(@Query() query: ReportPeriodDto): Promise<OperatorLoadReport> {
    return this.reports.operators(this.period(query));
  }

  private period(query: ReportPeriodDto): { from?: Date; to?: Date } {
    return {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    };
  }
}
