import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateMyTicketMessageRequest,
  CreateMyTicketRequest,
  Paginated,
  TicketAuthorRole,
  TicketDetailView,
  TicketMessageView,
  TicketStatus,
  TicketSummary,
} from '@advault/types';
import type {
  Order as DbOrder,
  Ticket as DbTicket,
  TicketMessage as DbTicketMessage,
} from '@prisma/client';

type TicketRow = DbTicket & {
  order: Pick<DbOrder, 'id' | 'number'> | null;
  _count: { messages: number };
};

type TicketDetailRow = DbTicket & {
  order: Pick<DbOrder, 'id' | 'number'> | null;
  messages: DbTicketMessage[];
};

/** e.g. TK-2026-000042 (docs/backend/prisma-schema.md). */
function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  return `TK-${year}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
}

/**
 * Buyer-facing support tickets (E9). Reuses the Ticket/TicketMessage models but
 * every query is scoped to `requesterId = userId` — a foreign or unknown ticket
 * is a 404 (existence is never disclosed). Internal notes (`isInternal = true`)
 * are stripped from every buyer projection, and staff identities are reduced to
 * a coarse `authorRole` so support emails/names never leak. Only the admin side
 * assigns, prioritises, or writes internal notes.
 */
@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    userId: string,
    page: number,
    limit: number,
    status?: TicketStatus,
  ): Promise<Paginated<TicketSummary>> {
    const where: Prisma.TicketWhereInput = {
      requesterId: userId,
      ...(status ? { status } : {}),
      // Count only public messages in the summary badge.
    };

    const [rows, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: { lastReplyAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          order: { select: { id: true, number: true } },
          _count: { select: { messages: { where: { isInternal: false } } } },
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      data: (rows as TicketRow[]).map((row) => this.toSummary(row)),
      meta: { total, page, limit },
    };
  }

  async get(userId: string, id: string): Promise<TicketDetailView> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, requesterId: userId },
      include: {
        order: { select: { id: true, number: true } },
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) throw new ApiException('NOT_FOUND', 'Ticket not found', 404);
    return this.toDetail(ticket as TicketDetailRow, userId);
  }

  async create(userId: string, dto: CreateMyTicketRequest): Promise<TicketDetailView> {
    if (dto.orderId) await this.assertOwnOrder(dto.orderId, userId);

    const created = await this.prisma.ticket.create({
      data: {
        number: generateTicketNumber(),
        subject: dto.subject.trim(),
        requesterId: userId,
        orderId: dto.orderId ?? null,
        // A new ticket starts open (awaiting staff); the first buyer message is public.
        messages: { create: { authorId: userId, body: dto.body.trim(), isInternal: false } },
      },
    });

    await this.audit.record({
      actorId: userId,
      action: 'ticket.create',
      entity: 'Ticket',
      entityId: created.id,
      diff: { number: created.number, orderId: dto.orderId ?? null, via: 'customer' },
    });
    return this.get(userId, created.id);
  }

  async addMessage(
    userId: string,
    id: string,
    dto: CreateMyTicketMessageRequest,
  ): Promise<TicketDetailView> {
    const ticket = await this.prisma.ticket.findFirst({ where: { id, requesterId: userId } });
    if (!ticket) throw new ApiException('NOT_FOUND', 'Ticket not found', 404);
    if (ticket.status === 'closed') {
      throw new ApiException('CONFLICT', 'Ticket is closed; open a new one', 409);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketMessage.create({
        data: { ticketId: id, authorId: userId, body: dto.body.trim(), isInternal: false },
      });
      await tx.ticket.update({
        where: { id },
        // A buyer reply always needs staff attention: pending/resolved reopen to open.
        data: {
          lastReplyAt: new Date(),
          ...(ticket.status === 'open' ? {} : { status: 'open', closedAt: null }),
        },
      });
    });

    await this.audit.record({
      actorId: userId,
      action: 'ticket.reply',
      entity: 'Ticket',
      entityId: id,
      diff: { via: 'customer' },
    });
    return this.get(userId, id);
  }

  // ---------- Internals ----------

  private async assertOwnOrder(orderId: string, userId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order) {
      throw new ApiException('VALIDATION_ERROR', 'Order not found for this account', 400);
    }
  }

  private toSummary(row: TicketRow): TicketSummary {
    return {
      id: row.id,
      number: row.number,
      subject: row.subject,
      status: row.status as TicketStatus,
      orderId: row.orderId,
      orderNumber: row.order?.number ?? null,
      messageCount: row._count.messages,
      lastReplyAt: row.lastReplyAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toDetail(row: TicketDetailRow, requesterId: string): TicketDetailView {
    const messages = row.messages.filter((m) => !m.isInternal);
    return {
      id: row.id,
      number: row.number,
      subject: row.subject,
      status: row.status as TicketStatus,
      orderId: row.orderId,
      orderNumber: row.order?.number ?? null,
      messageCount: messages.length,
      lastReplyAt: row.lastReplyAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      messages: messages.map((m): TicketMessageView => ({
        id: m.id,
        authorRole: authorRoleOf(m.authorId, requesterId),
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }
}

/** Coarse author role for the buyer view — never a staff identity. */
function authorRoleOf(authorId: string | null, requesterId: string): TicketAuthorRole {
  if (authorId === null) return 'system';
  return authorId === requesterId ? 'customer' : 'staff';
}
