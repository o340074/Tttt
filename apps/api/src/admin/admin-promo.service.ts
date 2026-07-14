import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdminPromoCode,
  CreatePromoCodeRequest,
  PromoType,
  UpdatePromoCodeRequest,
} from '@advault/types';
import type { PromoCode as DbPromoCode } from '@prisma/client';

/**
 * Promo-code administration (docs/13 §12). Managers/admins create and tune
 * percent/fixed discounts with usage caps and expiry; redemption stays in
 * checkout (E4). The code is immutable once created (it is the redemption key);
 * every mutation is audited. Value is validated per type: percent 1–100, fixed >0.
 */
@Injectable()
export class AdminPromoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AdminPromoCode[]> {
    const rows = await this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((row) => this.toDto(row));
  }

  async create(actorId: string, body: CreatePromoCodeRequest): Promise<AdminPromoCode> {
    const code = body.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      throw new ApiException('VALIDATION_ERROR', 'Code must be 3–32 chars [A-Z0-9_-]', 400, {
        fields: { code: ['3–32 characters, A–Z 0–9 _ -'] },
      });
    }
    const value = this.parseValue(body.type, body.value);
    const maxUses = this.normalizeMaxUses(body.maxUses);
    const expiresAt = this.normalizeExpiry(body.expiresAt);

    try {
      const row = await this.prisma.promoCode.create({
        data: { code, type: body.type, value, maxUses, expiresAt },
      });
      await this.audit.record({
        actorId,
        action: 'promo.create',
        entity: 'PromoCode',
        entityId: row.id,
        diff: { code, type: body.type, value: value.toFixed(2), maxUses, expiresAt },
      });
      return this.toDto(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiException('CONFLICT', 'A promo code with this code already exists', 409);
      }
      throw error;
    }
  }

  async update(actorId: string, id: string, body: UpdatePromoCodeRequest): Promise<AdminPromoCode> {
    const existing = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!existing) throw new ApiException('NOT_FOUND', 'Promo code not found', 404);

    const type: PromoType = body.type ?? (existing.type as PromoType);
    const data: Prisma.PromoCodeUpdateInput = {};
    if (body.type !== undefined) data.type = body.type;
    if (body.value !== undefined) data.value = this.parseValue(type, body.value);
    else if (body.type !== undefined) {
      // Re-validate the existing value against the new type (percent cap).
      this.parseValue(type, existing.value.toString());
    }
    if (body.maxUses !== undefined) data.maxUses = this.normalizeMaxUses(body.maxUses);
    if (body.expiresAt !== undefined) data.expiresAt = this.normalizeExpiry(body.expiresAt);

    const row = await this.prisma.promoCode.update({ where: { id }, data });
    await this.audit.record({
      actorId,
      action: 'promo.update',
      entity: 'PromoCode',
      entityId: id,
      diff: { ...body },
    });
    return this.toDto(row);
  }

  async remove(actorId: string, id: string): Promise<void> {
    const existing = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!existing) throw new ApiException('NOT_FOUND', 'Promo code not found', 404);
    // Orders keep working: Order.promoCodeId is set null on delete (schema).
    await this.prisma.promoCode.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: 'promo.delete',
      entity: 'PromoCode',
      entityId: id,
      diff: { code: existing.code },
    });
  }

  // ---------- Internals ----------

  private parseValue(type: PromoType, raw: string): Prisma.Decimal {
    let value: Prisma.Decimal;
    try {
      value = new Prisma.Decimal(raw);
    } catch {
      throw new ApiException('VALIDATION_ERROR', 'Value must be a number', 400, {
        fields: { value: ['must be a number'] },
      });
    }
    if (value.lte(0)) {
      throw new ApiException('VALIDATION_ERROR', 'Value must be positive', 400, {
        fields: { value: ['must be positive'] },
      });
    }
    if (type === 'percent' && value.gt(100)) {
      throw new ApiException('VALIDATION_ERROR', 'Percent value must be 1–100', 400, {
        fields: { value: ['percent must be 1–100'] },
      });
    }
    return value;
  }

  private normalizeMaxUses(maxUses: number | null | undefined): number | null {
    if (maxUses === undefined || maxUses === null) return null;
    if (!Number.isInteger(maxUses) || maxUses < 1) {
      throw new ApiException('VALIDATION_ERROR', 'maxUses must be a positive integer', 400, {
        fields: { maxUses: ['positive integer or null'] },
      });
    }
    return maxUses;
  }

  private normalizeExpiry(expiresAt: string | null | undefined): Date | null {
    if (expiresAt === undefined || expiresAt === null) return null;
    const date = new Date(expiresAt);
    if (Number.isNaN(date.getTime())) {
      throw new ApiException('VALIDATION_ERROR', 'expiresAt must be a valid date', 400, {
        fields: { expiresAt: ['ISO 8601 date-time or null'] },
      });
    }
    return date;
  }

  private toDto(row: DbPromoCode): AdminPromoCode {
    return {
      id: row.id,
      code: row.code,
      type: row.type as PromoType,
      value: row.value.toFixed(2),
      maxUses: row.maxUses,
      usedCount: row.usedCount,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
