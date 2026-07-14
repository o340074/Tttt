import { Injectable } from '@nestjs/common';
import { lineName } from '../cart/cart.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminStockRow, Locale, StockStatus } from '@advault/types';

/**
 * Admin read view over the READY_STOCK pool (docs/13). Aggregates StockItem
 * counts per variant by status — payloads are never read here (E5: secrets
 * reach the buyer's Vault only). Import/replenish stays on the existing
 * `/admin/products/:id/variants/:variantId/stock/import` endpoint.
 */
@Injectable()
export class AdminStockService {
  constructor(private readonly prisma: PrismaService) {}

  async list(locale: Locale): Promise<AdminStockRow[]> {
    const [variants, grouped] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: { fulfillmentType: 'READY_STOCK' },
        include: { product: { include: { translations: true } } },
        orderBy: { sku: 'asc' },
      }),
      this.prisma.stockItem.groupBy({
        by: ['variantId', 'status'],
        _count: { _all: true },
      }),
    ]);

    // variantId → { status → count }
    const counts = new Map<string, Partial<Record<StockStatus, number>>>();
    for (const g of grouped) {
      const byStatus = counts.get(g.variantId) ?? {};
      byStatus[g.status as StockStatus] = g._count._all;
      counts.set(g.variantId, byStatus);
    }

    return variants.map((variant) => {
      const byStatus = counts.get(variant.id) ?? {};
      const available = byStatus.available ?? 0;
      const reserved = byStatus.reserved ?? 0;
      const sold = byStatus.sold ?? 0;
      return {
        productId: variant.productId,
        productSlug: variant.product.slug,
        variantId: variant.id,
        sku: variant.sku,
        name: lineName(variant, locale),
        available,
        reserved,
        sold,
        total: available + reserved + sold,
      };
    });
  }
}
