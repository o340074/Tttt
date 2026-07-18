import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdminTicketDetail,
  AdminTicketListItem,
  AdminTicketMessage,
  CreateTicketMessageRequest,
  CreateTicketRequest,
  Paginated,
  TicketPriority,
  TicketStatus,
  UpdateTicketRequest,
} from '@advault/types';
import type {
  Order as DbOrder,
  Ticket as DbTicket,
  TicketMessage as DbTicketMessage,
  User as DbUser,
} from '@prisma/client';

type TicketRow = DbTicket & {
  requester: Pick<DbUser, 'id' | 'email'>;
  assignee: Pick<DbUser, 'id' | 'email'> | null;
  order: Pick<DbOrder, 'id' | 'number'> | null;
  _count: { messages: number };
  /** Latest message (take: 1, desc) — used only to flag customer replies. */
  messages?: Pick<DbTicketMessage, 'authorId' | 'createdAt'>[];
};

type TicketDetailRow = Omit<TicketRow, 'messages'> & {
  messages: (DbTicketMessage & { author: Pick<DbUser, 'id' | 'email'> | null })[];
};

/** e.g. TK-2026-000042 (docs/backend/prisma-schema.md). */
function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  return `TK-${year}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
}

/** True when the newest message (any) was authored by the requester (buyer). */
function latestFromCustomer(
  messages: Pick<DbTicketMessage, 'authorId' | 'createdAt'>[] | undefined,
  requesterId: string,
): boolean {
  if (!messages || messages.length === 0) return false;
  const latest = messages.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
  return latest.authorId === requesterId;
}

/**
 * Support tickets (docs/13 §13). A small status machine (open→pending→resolved→
 * closed) over a message thread; internal notes are messages with
 * `isInternal = true` and are stripped from any buyer-facing projection (here
 * everything is staff-facing, so they are returned but flagged). Every mutation
 * is audited; assignment/state changes carry a before→after diff.
 */
@Injectable()
export class AdminTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    filters: { status?: TicketStatus; assigneeId?: string; q?: string },
    page: number,
    limit: number,
  ): Promise<Paginated<AdminTicketListItem>> {
    const where: Prisma.TicketWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { number: { contains: q, mode: 'insensitive' } },
        { subject: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: { lastReplyAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: this.listInclude(),
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      data: (rows as TicketRow[]).map((row) => this.toListItem(row)),
      meta: { total, page, limit },
    };
  }

  async get(id: string): Promise<AdminTicketDetail> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        ...this.listInclude(),
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, email: true } } },
        },
      },
    });
    if (!ticket) throw new ApiException('NOT_FOUND', 'Ticket not found', 404);
    return this.toDetail(ticket as TicketDetailRow);
  }

  /** Raise a ticket on behalf of an existing customer (resolved by email). */
  async create(actorId: string, dto: CreateTicketRequest): Promise<AdminTicketDetail> {
    const requester = await this.prisma.user.findUnique({
      where: { email: dto.requesterEmail.toLowerCase() },
    });
    if (!requester) {
      throw new ApiException('NOT_FOUND', 'No customer with that email', 404);
    }
    if (dto.orderId) await this.assertOrderBelongsTo(dto.orderId, requester.id);

    const priority: TicketPriority = dto.priority ?? 'normal';
    const created = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.create({
        data: {
          number: generateTicketNumber(),
          subject: dto.subject.trim(),
          priority,
          requesterId: requester.id,
          orderId: dto.orderId ?? null,
          messages: {
            create: { authorId: actorId, body: dto.body.trim(), isInternal: false },
          },
        },
      });
      return ticket;
    });

    await this.audit.record({
      actorId,
      action: 'ticket.create',
      entity: 'Ticket',
      entityId: created.id,
      diff: { number: created.number, requesterId: requester.id, orderId: dto.orderId ?? null },
    });
    return this.get(created.id);
  }

  /** Append a reply or an internal note; bumps lastReplyAt (queue ordering). */
  async addMessage(
    actorId: string,
    id: string,
    dto: CreateTicketMessageRequest,
  ): Promise<AdminTicketDetail> {
    const ticket = await this.requireTicket(id);
    if (ticket.status === 'closed') {
      throw new ApiException('CONFLICT', 'Ticket is closed; reopen it to reply', 409);
    }
    const isInternal = dto.isInternal ?? false;

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketMessage.create({
        data: { ticketId: id, authorId: actorId, body: dto.body.trim(), isInternal },
      });
      await tx.ticket.update({
        where: { id },
        // A public reply from staff moves an open ticket to "pending" (awaiting
        // the customer); an internal note leaves the state untouched.
        data: {
          lastReplyAt: new Date(),
          ...(isInternal || ticket.status !== 'open' ? {} : { status: 'pending' }),
        },
      });
    });

    await this.audit.record({
      actorId,
      action: isInternal ? 'ticket.note' : 'ticket.reply',
      entity: 'Ticket',
      entityId: id,
      diff: { internal: isInternal },
    });

    // A public staff reply notifies the buyer (in-app + email); internal notes
    // stay invisible. Best-effort — emit never throws (see NotificationsService).
    if (!isInternal) {
      await this.notifications.emit(
        ticket.requesterId,
        'ticketReply',
        { number: ticket.number },
        { ticketId: ticket.id, ticketNumber: ticket.number },
      );
    }
    return this.get(id);
  }

  /** Change status / priority / assignee. Closing stamps closedAt. */
  async update(actorId: string, id: string, dto: UpdateTicketRequest): Promise<AdminTicketDetail> {
    const ticket = await this.requireTicket(id);
    const data: Prisma.TicketUpdateInput = {};
    const diff: Record<string, unknown> = {};

    if (dto.status && dto.status !== ticket.status) {
      data.status = dto.status;
      data.closedAt = dto.status === 'closed' ? new Date() : null;
      diff.status = { from: ticket.status, to: dto.status };
    }
    if (dto.priority && dto.priority !== ticket.priority) {
      data.priority = dto.priority;
      diff.priority = { from: ticket.priority, to: dto.priority };
    }
    if (dto.assigneeId !== undefined && dto.assigneeId !== ticket.assigneeId) {
      if (dto.assigneeId) await this.assertStaff(dto.assigneeId);
      data.assignee = dto.assigneeId ? { connect: { id: dto.assigneeId } } : { disconnect: true };
      diff.assignee = { from: ticket.assigneeId, to: dto.assigneeId };
    }

    if (Object.keys(diff).length === 0) return this.get(id);

    await this.prisma.ticket.update({ where: { id }, data });
    await this.audit.record({
      actorId,
      action: 'ticket.update',
      entity: 'Ticket',
      entityId: id,
      diff: diff as Prisma.InputJsonValue,
    });
    return this.get(id);
  }

  // ---------- Internals ----------

  private listInclude() {
    return {
      requester: { select: { id: true, email: true } },
      assignee: { select: { id: true, email: true } },
      order: { select: { id: true, number: true } },
      _count: { select: { messages: true } },
      // Latest message only, to flag whether the buyer is the one waiting.
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { authorId: true, createdAt: true },
      },
    } satisfies Prisma.TicketInclude;
  }

  private async requireTicket(id: string): Promise<DbTicket> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new ApiException('NOT_FOUND', 'Ticket not found', 404);
    return ticket;
  }

  private async assertStaff(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role === 'user') {
      throw new ApiException('VALIDATION_ERROR', 'Assignee must be a staff member', 400);
    }
  }

  private async assertOrderBelongsTo(orderId: string, userId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) {
      throw new ApiException('VALIDATION_ERROR', 'Order does not belong to that customer', 400);
    }
  }

  private toListItem(row: TicketRow): AdminTicketListItem {
    return {
      id: row.id,
      number: row.number,
      subject: row.subject,
      status: row.status as TicketStatus,
      priority: row.priority as TicketPriority,
      requester: { id: row.requester.id, email: row.requester.email },
      assignee: row.assignee ? { id: row.assignee.id, email: row.assignee.email } : null,
      orderId: row.orderId,
      orderNumber: row.order?.number ?? null,
      messageCount: row._count.messages,
      lastMessageFromCustomer: latestFromCustomer(row.messages, row.requester.id),
      lastReplyAt: row.lastReplyAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toDetail(row: TicketDetailRow): AdminTicketDetail {
    return {
      ...this.toListItem(row),
      closedAt: row.closedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      messages: row.messages.map((m): AdminTicketMessage => ({
        id: m.id,
        authorId: m.authorId,
        authorEmail: m.author?.email ?? null,
        body: m.body,
        isInternal: m.isInternal,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }
}
