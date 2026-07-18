import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiException } from '../common/api-exception';
import { Roles } from '../auth/decorators';
import { ORDERS_STAFF } from '../auth/roles';
import { resolveLocale } from '../catalog/locale';
import { AdminOrdersService } from './admin-orders.service';
import { AdminOrderQueryDto } from './dto/admin-orders.dto';
import type { AdminOrderDetail, AdminOrderListItem, Paginated } from '@advault/types';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApiException('VALIDATION_ERROR', 'id must be a UUID', 400),
});

/**
 * Admin/operator orders surface (docs/13, docs/14). Read-only: fulfilment is
 * driven through the warming/inventory endpoints. RBAC support/operator/manager/
 * admin; delivery payloads stay owner-only (E5) and are never returned here.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...ORDERS_STAFF)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  async list(@Query() query: AdminOrderQueryDto): Promise<Paginated<AdminOrderListItem>> {
    return this.orders.list({ status: query.status, q: query.q }, query.page, query.limit);
  }

  @Get(':id')
  async get(
    @Param('id', uuidPipe) id: string,
    @Query() query: AdminOrderQueryDto,
  ): Promise<AdminOrderDetail> {
    return this.orders.get(id, resolveLocale(query.locale));
  }
}
