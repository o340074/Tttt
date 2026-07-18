import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SUPPORTED_LOCALES } from '../catalog/locale';
import { recomputeProductRating } from '../reviews/reviews.service';
import type { AdminReviewListItem, Locale, Paginated } from '@advault/types';
import type { Prisma } from '@prisma/client';

const REVIEW_INCLUDE = {
  author: { select: { email: true } },
  product: {
    select: { slug: true, translations: { select: { locale: true, name: true } } },
  },
} satisfies Prisma.ReviewInclude;

type ReviewRow = Prisma.ReviewGetPayload<{ include: typeof REVIEW_INCLUDE }>;

/**
 * Review moderation (E11, docs/13). Staff can list reviews and hide/restore an
 * abusive one without deleting it; hiding recomputes the product rating so the
 * cache never counts suppressed reviews. Every action is audited.
 */
@Injectable()
export class AdminReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    page: number,
    limit: number,
    hidden: boolean | undefined,
    locale: Locale,
  ): Promise<Paginated<AdminReviewListItem>> {
    const where: Prisma.ReviewWhereInput = hidden === undefined ? {} : { hidden };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: REVIEW_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      data: (rows as ReviewRow[]).map((row) => this.toAdminView(row, locale)),
      meta: { total, page, limit },
    };
  }

  async moderate(
    actorId: string,
    id: string,
    hidden: boolean,
    locale: Locale,
  ): Promise<AdminReviewListItem> {
    const existing = await this.prisma.review.findUnique({ where: { id } });
    if (!existing) throw new ApiException('NOT_FOUND', 'Review not found', 404);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.review.update({
        where: { id },
        data: { hidden },
        include: REVIEW_INCLUDE,
      });
      await recomputeProductRating(tx, row.productId);
      return row;
    });

    await this.audit.record({
      actorId,
      action: hidden ? 'review.hidden' : 'review.restored',
      entity: 'Review',
      entityId: id,
      diff: { productId: existing.productId, hidden },
    });
    return this.toAdminView(updated as ReviewRow, locale);
  }

  private toAdminView(row: ReviewRow, locale: Locale): AdminReviewListItem {
    const translations = row.product.translations ?? [];
    const name =
      translations.find((t) => t.locale === locale)?.name ??
      translations.find((t) => t.locale === SUPPORTED_LOCALES[0])?.name ??
      row.product.slug;
    return {
      id: row.id,
      productSlug: row.product.slug,
      productName: name,
      rating: row.rating,
      title: row.title,
      body: row.body,
      authorEmail: row.author.email,
      hidden: row.hidden,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
