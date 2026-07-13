import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditInput {
  /** User performing the action; null for system events. */
  actorId?: string | null;
  /** Dotted verb, e.g. delivery.payload_accessed, stock.import. */
  action: string;
  /** Entity type, e.g. Delivery, StockItem. */
  entity: string;
  entityId?: string | null;
  /** Non-secret context of the action. NEVER put decrypted payloads here. */
  diff?: Prisma.InputJsonValue;
}

/**
 * Append-only audit trail (docs/09): every decryption of a delivery payload
 * and every stock import is recorded. A failure to write the log must not
 * break the audited action, but it is logged loudly.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId ?? null,
          diff: input.diff ?? {},
        },
      });
    } catch (error) {
      this.logger.error(`Failed to write audit log ${input.action}: ${(error as Error).message}`);
    }
  }
}
