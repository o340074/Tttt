import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import type { TopUpAsset } from '@advault/types';

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

export const TOPUP_ASSETS: TopUpAsset[] = ['USDT-TRC20', 'USDT-ERC20', 'BTC', 'ETH'];

export class CreateTopUpDto {
  /** Money string; the 1.00–100000.00 range is enforced in the service (Decimal). */
  @Matches(MONEY_PATTERN)
  amount!: string;

  @IsIn(TOPUP_ASSETS)
  asset!: TopUpAsset;
}

export class TransactionsQueryDto {
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
}
