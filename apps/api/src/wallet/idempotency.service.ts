import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { ApiException } from '../common/api-exception';
import { PrismaService } from '../prisma/prisma.service';

export interface StoredResponse {
  code: number;
  body: unknown;
}

/**
 * Idempotency-Key support for payment mutations (docs/backend/prisma-schema.md):
 * the key row is claimed BEFORE processing, the response is stored after.
 * A retry with the same key + same request replays the stored response;
 * a different request under the same key (or a still-in-flight original)
 * is an IDEMPOTENCY_CONFLICT.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the stored response to replay, or null when the key is now claimed. */
  async claim(
    key: string,
    endpoint: string,
    userId: string,
    requestBody: unknown,
  ): Promise<StoredResponse | null> {
    const requestHash = hashRequest(userId, requestBody);
    try {
      await this.prisma.idempotencyKey.create({ data: { key, endpoint, userId, requestHash } });
      return null;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
    }
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key_endpoint: { key, endpoint } },
    });
    if (!existing || existing.requestHash !== requestHash) {
      throw new ApiException(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key was already used with a different request',
        409,
      );
    }
    if (existing.responseCode === null) {
      throw new ApiException(
        'IDEMPOTENCY_CONFLICT',
        'The original request with this Idempotency-Key is still in progress',
        409,
      );
    }
    return { code: existing.responseCode, body: existing.responseBody };
  }

  async saveResponse(key: string, endpoint: string, code: number, body: unknown): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { key_endpoint: { key, endpoint } },
      data: { responseCode: code, responseBody: body as Prisma.InputJsonValue },
    });
  }

  /** Free the key after a processing failure so the client can retry it. */
  async release(key: string, endpoint: string): Promise<void> {
    await this.prisma.idempotencyKey
      .delete({ where: { key_endpoint: { key, endpoint } } })
      .catch(() => undefined);
  }
}

function hashRequest(userId: string, body: unknown): string {
  return createHash('sha256')
    .update(`${userId}\n${JSON.stringify(body ?? null)}`)
    .digest('hex');
}
