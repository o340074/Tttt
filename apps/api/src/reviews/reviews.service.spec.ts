import { beforeEach, describe, expect, it } from 'vitest';
import { ReviewsService } from './reviews.service';
import { ApiException } from '../common/api-exception';
import type { PrismaService } from '../prisma/prisma.service';
import type { OrderItemDeliveryStatus } from '@advault/types';

/**
 * Isolated in-memory Prisma mock — just the surface ReviewsService touches.
 * Keeps the shared fakes untouched while covering create + list + rating cache.
 */
interface ReviewRow {
  id: string;
  productId: string;
  orderItemId: string;
  authorId: string;
  rating: number;
  title: string | null;
  body: string | null;
  hidden: boolean;
  createdAt: Date;
  author: { email: string };
}

function makeMock() {
  const product = { id: 'prod-1', slug: 'ads-pro', ratingAvg: null as string | null };
  const orderItem = {
    id: 'oi-1',
    order: { userId: 'buyer-1' },
    variant: { productId: 'prod-1' },
    deliveryStatus: 'delivered' as OrderItemDeliveryStatus,
    review: null as { id: string } | null,
  };
  const reviews: ReviewRow[] = [];
  let seq = 0;

  const client = {
    product: {
      findUnique: ({ where }: { where: { slug?: string; id?: string } }) =>
        Promise.resolve(
          where.slug === product.slug || where.id === product.id ? { id: product.id } : null,
        ),
      update: ({ data }: { data: { ratingAvg: string | null } }) => {
        product.ratingAvg = data.ratingAvg;
        return Promise.resolve(product);
      },
    },
    orderItem: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === orderItem.id ? orderItem : null),
    },
    review: {
      findMany: ({
        where,
        select,
        skip = 0,
        take,
      }: {
        where: { productId: string; hidden?: boolean };
        select?: { rating?: boolean };
        skip?: number;
        take?: number;
      }) => {
        let rows = reviews.filter(
          (r) => r.productId === where.productId && (where.hidden === undefined || r.hidden === where.hidden),
        );
        rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        rows = rows.slice(skip, take !== undefined ? skip + take : undefined);
        return Promise.resolve(select?.rating ? rows.map((r) => ({ rating: r.rating })) : rows);
      },
      count: ({ where }: { where: { productId: string; hidden?: boolean } }) =>
        Promise.resolve(
          reviews.filter(
            (r) => r.productId === where.productId && (where.hidden === undefined || r.hidden === where.hidden),
          ).length,
        ),
      create: ({ data }: { data: Omit<ReviewRow, 'id' | 'createdAt' | 'hidden' | 'author'> }) => {
        const row: ReviewRow = {
          ...data,
          id: `rev-${++seq}`,
          hidden: false,
          createdAt: new Date(Date.now() + seq),
          author: { email: 'buyer@example.com' },
        };
        reviews.push(row);
        orderItem.review = { id: row.id };
        return Promise.resolve(row);
      },
    },
    $transaction: <T>(fn: (tx: unknown) => Promise<T>) => fn(client),
  };

  return { client: client as unknown as PrismaService, state: { product, orderItem, reviews } };
}

describe('ReviewsService (E11)', () => {
  let mock: ReturnType<typeof makeMock>;
  let service: ReviewsService;

  beforeEach(() => {
    mock = makeMock();
    service = new ReviewsService(mock.client);
  });

  it('creates a review for a delivered line and refreshes the rating cache', async () => {
    const review = await service.create('buyer-1', { orderItemId: 'oi-1', rating: 5, title: 'Great' });
    expect(review.rating).toBe(5);
    expect(review.authorName).toBe('bu***');
    expect(mock.state.product.ratingAvg).toBe('5.00');
  });

  it('404s a foreign or unknown line (scoping, not 403)', async () => {
    await expect(
      service.create('someone-else', { orderItemId: 'oi-1', rating: 5 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' } as Partial<ApiException>);
  });

  it('rejects a review on a not-yet-delivered line', async () => {
    mock.state.orderItem.deliveryStatus = 'pending';
    await expect(
      service.create('buyer-1', { orderItemId: 'oi-1', rating: 4 }),
    ).rejects.toMatchObject({ code: 'REVIEW_NOT_ALLOWED' });
  });

  it('rejects a second review of the same line', async () => {
    await service.create('buyer-1', { orderItemId: 'oi-1', rating: 5 });
    await expect(
      service.create('buyer-1', { orderItemId: 'oi-1', rating: 3 }),
    ).rejects.toMatchObject({ code: 'REVIEW_NOT_ALLOWED' });
  });

  it('lists visible reviews with a masked author and a summary', async () => {
    await service.create('buyer-1', { orderItemId: 'oi-1', rating: 4, body: 'ok' });
    const page = await service.listForProduct('ads-pro', 1, 20);
    expect(page.meta.total).toBe(1);
    expect(page.summary.average).toBe('4.00');
    expect(page.summary.distribution[4]).toBe(1);
    expect(page.data[0]!.authorName).toBe('bu***');
    expect(page.data[0]!.body).toBe('ok');
  });

  it('404s reviews for an unknown product', async () => {
    await expect(service.listForProduct('nope', 1, 20)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
