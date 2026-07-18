import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PromoCode as DbPromoCode } from '@prisma/client';

/**
 * Promo codes (docs/backend/prisma-schema.md): percent/fixed value with
 * optional maxUses and expiresAt. This service only reads/validates;
 * usedCount is incremented atomically inside the checkout transaction.
 */
@Injectable()
export class PromoService {
  constructor(private readonly prisma: PrismaService) {}

  /** The promo row when the code is currently applicable, else null. */
  async findValid(code: string): Promise<DbPromoCode | null> {
    const row = await this.prisma.promoCode.findUnique({
      where: { code: normalizePromoCode(code) },
    });
    if (!row) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
    if (row.maxUses !== null && row.usedCount >= row.maxUses) return null;
    return row;
  }

  /** Discount for a subtotal: percent of it or a fixed cut, capped at the subtotal. */
  discountFor(promo: DbPromoCode, subtotal: Prisma.Decimal): Prisma.Decimal {
    const discount =
      promo.type === 'percent'
        ? subtotal
            .times(promo.value)
            .dividedBy(100)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        : new Prisma.Decimal(promo.value);
    return discount.gt(subtotal) ? subtotal : discount;
  }
}

/** Codes are stored uppercase; user input is matched case-insensitively. */
export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase();
}
