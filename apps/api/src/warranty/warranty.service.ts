import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeWindow,
  generateClaimNumber,
  hasOpenClaim,
  isClaimEligible,
} from './warranty.logic';
import type {
  CreateWarrantyClaimRequest,
  Locale,
  Paginated,
  WarrantyClaimView,
} from '@advault/types';
import type { WarrantyClaim as DbClaim } from '@prisma/client';

/** Retries for the rare human-readable claim number collision. */
const NUMBER_ATTEMPTS = 3;

/** Claim joined with everything the buyer view needs (order number + item name). */
const CLAIM_VIEW_INCLUDE = {
  orderItem: {
    select: { nameSnapshot: true, order: { select: { id: true, number: true } } },
  },
} satisfies Prisma.WarrantyClaimInclude;

type ClaimWithView = Prisma.WarrantyClaimGetPayload<{ include: typeof CLAIM_VIEW_INCLUDE }>;

/**
 * Buyer-facing warranty portal (E10). Every route is scoped to the current
 * user: a buyer opens a replace/refund claim on one of their own delivered
 * lines, strictly inside its warranty window (warrantyHours from delivery).
 * Staff triage and fulfillment live on the admin surface; nothing here moves
 * money or issues assets — it only records the request and audits it.
 */
@Injectable()
export class WarrantyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    userId: string,
    dto: CreateWarrantyClaimRequest,
    locale: Locale,
  ): Promise<WarrantyClaimView> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: dto.orderItemId, order: { userId } },
      include: {
        order: { select: { id: true, number: true } },
        variant: { select: { warrantyHours: true } },
        deliveries: { orderBy: { createdAt: 'asc' } },
        warrantyClaims: { select: { status: true } },
      },
    });
    // Existence is not disclosed for a foreign/unknown line.
    if (!item) throw new ApiException('NOT_FOUND', 'Order item not found', 404);

    const latest = item.deliveries.at(-1) ?? null;
    const deliveredAt = latest ? (latest.deliveredAt ?? latest.createdAt) : null;
    const warrantyHours = item.variant.warrantyHours;
    const existingStatuses = item.warrantyClaims.map((c) => c.status);

    // Map the failing eligibility gate to a precise 4xx (docs/14).
    if (item.deliveryStatus !== 'delivered' && item.deliveryStatus !== 'replaced') {
      throw new ApiException('CONFLICT', 'This line has not been delivered', 409, {
        deliveryStatus: item.deliveryStatus,
      });
    }
    if (hasOpenClaim(existingStatuses)) {
      throw new ApiException('CONFLICT', 'This line already has an open warranty claim', 409);
    }
    if (warrantyHours == null || warrantyHours <= 0) {
      throw new ApiException('VALIDATION_ERROR', 'This item carries no warranty', 422);
    }
    const window = computeWindow(deliveredAt, warrantyHours);
    if (!window.withinWindow) {
      throw new ApiException('CONFLICT', 'The warranty window has expired', 409, {
        expiresAt: window.expiresAt?.toISOString() ?? null,
      });
    }
    // Defensive: the pure gate must agree with the mapped checks above.
    if (
      !isClaimEligible({
        deliveryStatus: item.deliveryStatus,
        deliveredAt,
        warrantyHours,
        existingClaimStatuses: existingStatuses,
      })
    ) {
      throw new ApiException('CONFLICT', 'This line is not eligible for a warranty claim', 409);
    }

    const created = await this.createWithNumber({
      orderItemId: item.id,
      deliveryId: latest?.id ?? null,
      requesterId: userId,
      type: dto.type,
      reason: dto.reason,
      warrantyExpiresAt: window.expiresAt!,
    });

    await this.audit.record({
      actorId: userId,
      action: 'warranty.claim.requested',
      entity: 'WarrantyClaim',
      entityId: created.id,
      diff: { orderItemId: item.id, type: dto.type, number: created.number },
    });

    return this.get(userId, created.id, locale);
  }

  async list(
    userId: string,
    page: number,
    limit: number,
    locale: Locale,
  ): Promise<Paginated<WarrantyClaimView>> {
    const [rows, total] = await Promise.all([
      this.prisma.warrantyClaim.findMany({
        where: { requesterId: userId },
        include: CLAIM_VIEW_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.warrantyClaim.count({ where: { requesterId: userId } }),
    ]);
    return {
      data: rows.map((r) => this.toView(r, locale)),
      meta: { total, page, limit },
    };
  }

  async get(userId: string, id: string, locale: Locale): Promise<WarrantyClaimView> {
    const row = await this.prisma.warrantyClaim.findFirst({
      where: { id, requesterId: userId },
      include: CLAIM_VIEW_INCLUDE,
    });
    if (!row) throw new ApiException('NOT_FOUND', 'Warranty claim not found', 404);
    return this.toView(row, locale);
  }

  // ---------- Internals ----------

  private async createWithNumber(
    data: Omit<Prisma.WarrantyClaimUncheckedCreateInput, 'number'>,
  ): Promise<DbClaim> {
    for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.warrantyClaim.create({
          data: { ...data, number: generateClaimNumber() },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < NUMBER_ATTEMPTS - 1
        ) {
          continue; // number collision — try another
        }
        throw error;
      }
    }
    throw new ApiException('INTERNAL_ERROR', 'Could not allocate a claim number', 500);
  }

  private toView(row: ClaimWithView, locale: Locale): WarrantyClaimView {
    const names = (row.orderItem.nameSnapshot ?? {}) as Partial<Record<Locale, string>>;
    return {
      id: row.id,
      number: row.number,
      orderId: row.orderItem.order.id,
      orderNumber: row.orderItem.order.number,
      orderItemId: row.orderItemId,
      itemName: names[locale] ?? names.en ?? '',
      type: row.type,
      status: row.status,
      reason: row.reason,
      resolutionNote: row.resolutionNote,
      warrantyExpiresAt: row.warrantyExpiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    };
  }
}
