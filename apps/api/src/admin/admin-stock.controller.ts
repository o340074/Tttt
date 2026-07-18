import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators';
import { INVENTORY_STAFF } from '../auth/roles';
import { LocaleQueryDto } from '../catalog/dto/catalog.dto';
import { resolveLocale } from '../catalog/locale';
import { AdminStockService } from './admin-stock.service';
import type { AdminStockRow } from '@advault/types';

/**
 * Admin read view of the READY_STOCK pool (docs/13): per-variant counts by
 * status. RBAC operator/support/manager/admin. Replenishment stays on the
 * stock-import endpoint; payloads are never exposed here.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...INVENTORY_STAFF)
@Controller('admin/stock')
export class AdminStockController {
  constructor(private readonly stock: AdminStockService) {}

  @Get()
  async list(@Query() query: LocaleQueryDto): Promise<AdminStockRow[]> {
    return this.stock.list(resolveLocale(query.locale));
  }
}
