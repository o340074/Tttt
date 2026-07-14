import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LocaleQueryDto } from '../../catalog/dto/catalog.dto';
import type { OrderStatus } from '@advault/types';

const ORDER_STATUSES = [
  'pending',
  'paid',
  'partially_delivered',
  'delivered',
  'cancelled',
  'refunded',
] as const;

export class AdminOrderQueryDto extends LocaleQueryDto {
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
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus;

  /** Free-text: order number or buyer email (contains, case-insensitive). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
