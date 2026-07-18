import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { TicketPriority, TicketStatus } from '@advault/types';

const TICKET_STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;
const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export class AdminTicketQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsIn(TICKET_STATUSES)
  status?: TicketStatus;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  /** Free-text: ticket number or subject (contains, case-insensitive). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class CreateTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsEmail()
  @MaxLength(200)
  requesterEmail!: string;

  @IsOptional()
  @IsUUID()
  orderId?: string | null;

  @IsOptional()
  @IsIn(TICKET_PRIORITIES)
  priority?: TicketPriority;
}

export class CreateTicketMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}

export class UpdateTicketDto {
  @IsOptional()
  @IsIn(TICKET_STATUSES)
  status?: TicketStatus;

  @IsOptional()
  @IsIn(TICKET_PRIORITIES)
  priority?: TicketPriority;

  /** Reassign; null unassigns. Omitted → unchanged. */
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;
}
