import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../prisma/prisma.service';
import { buildSummary, isReviewableStatus, isValidRating, maskAuthorName } from './reviews.logic';
import type { CreateReviewRequest, ProductReview, ProductReviewsResponse } from '@advault/types';
import type { Prisma } from '@prisma/client';

type ReviewWithAuthor = { author: { email: string } } & {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: Date;
};

/** Map a stored review to its public shape — the author is always masked. */
export function toPublicReview(row: ReviewWithAuthor): ProductReview {
  return {
    id: row.id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    authorName: maskAuthorName(row.author.email),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Recompute a product's denormalized `ratingAvg` from its *visible* reviews.
 * Called whenever a review is created or its visibility changes. Shared with the
 * admin moderation service so both paths keep the cache honest.
 */
export async function recomputeProductRating(
  tx: Pick<Prisma.TransactionClient, 'review' | 'product'>,
  productId: string,
): Promise<void> {
  const visible = await tx.review.findMany({
    where: { productId, hidden: false },
    select: { rating: true },
  });
  const ratings = visible.map((r) => r.rating);
  const average =
    ratings.length === 0 ? null : (ratings.reduce((a, r) => a + r, 0) / ratings.length).toFixed(2);
  await tx.product.update({ where: { id: productId }, data: { ratingAvg: average } });
}

/**
 * Product reviews (E11). Reviews are tied to a delivered OrderItem as proof of
 * purchase: only the line's owner may review, only once, only after the line is
 * delivered/replaced. The public list shows visible reviews with masked authors
 * plus a rating rollup; the product's `ratingAvg` cache is recomputed on write.
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /products/:slug/reviews — visible reviews + rating summary. */
  async listForProduct(slug: string, page: number, limit: number): Promise<ProductReviewsResponse> {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!product) throw new ApiException('NOT_FOUND', 'Product not found', 404);

    const where = { productId: product.id, hidden: false };
    const [rows, total, allRatings] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { author: { select: { email: true } } },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({ where, select: { rating: true } }),
    ]);

    return {
      data: (rows as ReviewWithAuthor[]).map(toPublicReview),
      meta: { total, page, limit },
      summary: buildSummary(allRatings.map((r) => r.rating)),
    };
  }

  /** POST /reviews — create the owner's review for a delivered line. */
  async create(userId: string, dto: CreateReviewRequest): Promise<ProductReview> {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: dto.orderItemId },
      include: {
        order: { select: { userId: true } },
        variant: { select: { productId: true } },
        review: { select: { id: true } },
      },
    });
    // Scope to the owner: a foreign or unknown line is a 404, never a 403 that
    // would confirm the line exists.
    if (!item || item.order.userId !== userId) {
      throw new ApiException('NOT_FOUND', 'Order line not found', 404);
    }
    if (!isReviewableStatus(item.deliveryStatus)) {
      throw new ApiException('REVIEW_NOT_ALLOWED', 'This line has not been delivered yet', 409);
    }
    if (item.review) {
      throw new ApiException('REVIEW_NOT_ALLOWED', 'This line has already been reviewed', 409);
    }
    if (!isValidRating(dto.rating)) {
      throw new ApiException('VALIDATION_ERROR', 'Rating must be an integer 1..5', 400);
    }

    const productId = item.variant.productId;
    const created = await this.prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          productId,
          orderItemId: dto.orderItemId,
          authorId: userId,
          rating: dto.rating,
          title: dto.title?.trim() || null,
          body: dto.body?.trim() || null,
        },
        include: { author: { select: { email: true } } },
      });
      await recomputeProductRating(tx, productId);
      return review;
    });

    return toPublicReview(created as ReviewWithAuthor);
  }
}
