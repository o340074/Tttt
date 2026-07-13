import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import type { StockImportReport } from '@advault/types';

/** Turn a JSON items[] body or a raw text/plain CSV/TXT into stock lines. */
function parseImportItems(body: unknown): string[] {
  if (typeof body === 'string') {
    return body.split(/\r?\n/);
  }
  if (
    body &&
    typeof body === 'object' &&
    Array.isArray((body as { items?: unknown }).items) &&
    (body as { items: unknown[] }).items.every((item) => typeof item === 'string')
  ) {
    return (body as { items: string[] }).items;
  }
  throw new ApiException('VALIDATION_ERROR', 'Provide items[] (JSON) or a text/plain body', 400, {
    fields: { items: ['array of strings, or a text/plain body'] },
  });
}

/** Admin operations that touch secrets/inventory (docs/13). RBAC is enforced at the route. */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly audit: AuditService,
  ) {}

  async importStock(
    actorId: string,
    productId: string,
    variantId: string,
    body: unknown,
  ): Promise<StockImportReport> {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });
    if (!variant) throw new ApiException('NOT_FOUND', 'Variant not found for this product', 404);
    if (variant.fulfillmentType !== 'READY_STOCK') {
      throw new ApiException('CONFLICT', 'Only READY_STOCK variants have a stock pool', 409);
    }

    const report = await this.stock.importLines(variantId, parseImportItems(body));
    await this.audit.record({
      actorId,
      action: 'stock.import',
      entity: 'ProductVariant',
      entityId: variantId,
      diff: { added: report.added, skipped: report.skipped },
    });
    return report;
  }
}
