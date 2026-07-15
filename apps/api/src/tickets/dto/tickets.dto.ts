import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type {
  CreateMyTicketMessageRequest,
  CreateMyTicketRequest,
  TicketStatus,
} from '@advault/types';

const TICKET_STATUSES: TicketStatus[] = ['open', 'pending', 'resolved', 'closed'];

export class MyTicketsQueryDto {
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
  @IsString()
  status?: TicketStatus;
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && (TICKET_STATUSES as string[]).includes(value);
}

export class CreateMyTicketDto implements CreateMyTicketRequest {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  @IsUUID()
  orderId?: string | null;
}

export class CreateMyTicketMessageDto implements CreateMyTicketMessageRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
